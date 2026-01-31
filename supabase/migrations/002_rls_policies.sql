-- RLS Policies for tasks table

-- Allow authenticated users and service role to read all tasks
CREATE POLICY "Allow read access to tasks"
    ON tasks FOR SELECT
    USING (true);

-- Allow authenticated users and service role to insert tasks
CREATE POLICY "Allow insert access to tasks"
    ON tasks FOR INSERT
    WITH CHECK (true);

-- Allow authenticated users and service role to update tasks
CREATE POLICY "Allow update access to tasks"
    ON tasks FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users and service role to delete tasks
CREATE POLICY "Allow delete access to tasks"
    ON tasks FOR DELETE
    USING (true);

-- RLS Policies for task_logs table

-- Allow read access to task logs
CREATE POLICY "Allow read access to task_logs"
    ON task_logs FOR SELECT
    USING (true);

-- Allow insert access to task logs
CREATE POLICY "Allow insert access to task_logs"
    ON task_logs FOR INSERT
    WITH CHECK (true);

-- Prevent updates and deletes on logs (audit trail immutability)
-- No UPDATE or DELETE policies means they're blocked by default with RLS enabled
