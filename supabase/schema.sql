-- =============================================================================
-- Geoff Database Schema
-- =============================================================================
-- Run this entire file in your Supabase SQL Editor to set up the database.
-- This combines all migrations into a single installation script.
-- =============================================================================

-- =============================================================================
-- Part 1: Enums
-- =============================================================================

CREATE TYPE task_status AS ENUM ('queued', 'ready', 'assigned', 'in_progress', 'done', 'failed', 'blocked');
CREATE TYPE task_complexity AS ENUM ('trivial', 'small', 'medium', 'large', 'unknown');
CREATE TYPE log_event_type AS ENUM ('created', 'status_change', 'note', 'error', 'completed', 'failed');

-- =============================================================================
-- Part 2: Projects Table
-- =============================================================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_is_active ON projects(is_active);
CREATE INDEX idx_projects_path ON projects(path);

-- =============================================================================
-- Part 3: Tasks Table
-- =============================================================================

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'queued',
    complexity task_complexity DEFAULT 'unknown',
    priority INTEGER DEFAULT 0,
    parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    depends_on UUID[] DEFAULT '{}',
    assigned_agent TEXT,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    result TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    context JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    attachments JSONB DEFAULT '[]'::jsonb,
    estimated_minutes INTEGER,
    actual_minutes INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_assigned_agent ON tasks(assigned_agent);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_has_attachments ON tasks ((attachments != '[]'::jsonb));

COMMENT ON COLUMN tasks.attachments IS 'Array of file attachments with base64 data: { name, type, size, data }';

-- =============================================================================
-- Part 4: Task Logs Table
-- =============================================================================

CREATE TABLE task_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    event_type log_event_type NOT NULL,
    message TEXT,
    old_status task_status,
    new_status task_status,
    agent_id TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
CREATE INDEX idx_task_logs_created_at ON task_logs(created_at DESC);

-- =============================================================================
-- Part 5: Row Level Security
-- =============================================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_logs ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Allow read access to projects"
    ON projects FOR SELECT USING (true);

CREATE POLICY "Allow insert access to projects"
    ON projects FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update access to projects"
    ON projects FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete access to projects"
    ON projects FOR DELETE USING (true);

-- Tasks policies
CREATE POLICY "Allow read access to tasks"
    ON tasks FOR SELECT USING (true);

CREATE POLICY "Allow insert access to tasks"
    ON tasks FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update access to tasks"
    ON tasks FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete access to tasks"
    ON tasks FOR DELETE USING (true);

-- Task logs policies (read/insert only - logs are immutable)
CREATE POLICY "Allow read access to task_logs"
    ON task_logs FOR SELECT USING (true);

CREATE POLICY "Allow insert access to task_logs"
    ON task_logs FOR INSERT WITH CHECK (true);

-- =============================================================================
-- Part 6: Trigger Functions
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Log status changes
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

-- Log task creation
CREATE OR REPLACE FUNCTION log_task_creation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO task_logs (task_id, event_type, new_status, message)
    VALUES (NEW.id, 'created', NEW.status, format('Task created: %s', NEW.title));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-promote queued tasks when dependencies complete
CREATE OR REPLACE FUNCTION check_and_promote_queued_tasks()
RETURNS TRIGGER AS $$
DECLARE
    queued_task RECORD;
    dep_id UUID;
    all_deps_done BOOLEAN;
BEGIN
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        FOR queued_task IN
            SELECT * FROM tasks
            WHERE status = 'queued'
            AND NEW.id = ANY(depends_on)
        LOOP
            all_deps_done := TRUE;

            FOREACH dep_id IN ARRAY queued_task.depends_on LOOP
                IF NOT EXISTS (
                    SELECT 1 FROM tasks
                    WHERE id = dep_id AND status = 'done'
                ) THEN
                    all_deps_done := FALSE;
                    EXIT;
                END IF;
            END LOOP;

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

-- Manage started_at and completed_at timestamps
CREATE OR REPLACE FUNCTION set_task_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
        NEW.started_at = COALESCE(NEW.started_at, NOW());
    END IF;

    IF NEW.status IN ('done', 'failed') AND OLD.status NOT IN ('done', 'failed') THEN
        NEW.completed_at = NOW();
        IF NEW.started_at IS NOT NULL THEN
            NEW.actual_minutes = EXTRACT(EPOCH FROM (NOW() - NEW.started_at)) / 60;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Part 7: Triggers
-- =============================================================================

-- Projects
CREATE TRIGGER projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Tasks
CREATE TRIGGER tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_manage_timestamps
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_task_timestamps();

CREATE TRIGGER tasks_status_change_log
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_status_change();

CREATE TRIGGER tasks_creation_log
    AFTER INSERT ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_creation();

CREATE TRIGGER tasks_promote_queued
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION check_and_promote_queued_tasks();

-- =============================================================================
-- Done! Your database is ready.
-- =============================================================================
