-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Function to log status changes
CREATE OR REPLACE FUNCTION log_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO task_logs (task_id, event_type, old_status, new_status, agent_id, message)
        VALUES (
            NEW.id,
            'status_change',
            OLD.status,
            NEW.status,
            NEW.assigned_agent,
            format('Status changed from %s to %s', OLD.status, NEW.status)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log status changes
CREATE TRIGGER tasks_status_change_log
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_status_change();

-- Function to log task creation
CREATE OR REPLACE FUNCTION log_task_creation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO task_logs (task_id, event_type, new_status, message)
    VALUES (NEW.id, 'created', NEW.status, format('Task created: %s', NEW.title));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log task creation
CREATE TRIGGER tasks_creation_log
    AFTER INSERT ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_creation();

-- Function to check and promote queued tasks to ready
CREATE OR REPLACE FUNCTION check_and_promote_queued_tasks()
RETURNS TRIGGER AS $$
DECLARE
    queued_task RECORD;
    dep_id UUID;
    all_deps_done BOOLEAN;
BEGIN
    -- Only run when a task is marked as done
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        -- Find all queued tasks that depend on this completed task
        FOR queued_task IN
            SELECT * FROM tasks
            WHERE status = 'queued'
            AND NEW.id = ANY(depends_on)
        LOOP
            all_deps_done := TRUE;

            -- Check if all dependencies are done
            FOREACH dep_id IN ARRAY queued_task.depends_on LOOP
                IF NOT EXISTS (
                    SELECT 1 FROM tasks
                    WHERE id = dep_id AND status = 'done'
                ) THEN
                    all_deps_done := FALSE;
                    EXIT;
                END IF;
            END LOOP;

            -- If all dependencies are done, promote to ready
            IF all_deps_done THEN
                UPDATE tasks
                SET status = 'ready'
                WHERE id = queued_task.id;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-promote queued tasks when dependencies complete
CREATE TRIGGER tasks_promote_queued
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION check_and_promote_queued_tasks();

-- Function to set started_at when task goes to in_progress
CREATE OR REPLACE FUNCTION set_task_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    -- Set started_at when moving to in_progress
    IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
        NEW.started_at = COALESCE(NEW.started_at, NOW());
    END IF;

    -- Set completed_at when moving to done or failed
    IF NEW.status IN ('done', 'failed') AND OLD.status NOT IN ('done', 'failed') THEN
        NEW.completed_at = NOW();
        -- Calculate actual_minutes if started_at exists
        IF NEW.started_at IS NOT NULL THEN
            NEW.actual_minutes = EXTRACT(EPOCH FROM (NOW() - NEW.started_at)) / 60;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for timestamp management
CREATE TRIGGER tasks_manage_timestamps
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_task_timestamps();
