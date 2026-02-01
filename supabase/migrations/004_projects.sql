-- Projects table for multi-project support
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

-- Add project reference to tasks
ALTER TABLE tasks ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Index for filtering tasks by project
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_projects_is_active ON projects(is_active);
CREATE INDEX idx_projects_path ON projects(path);

-- Enable RLS on projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- RLS policies for projects
CREATE POLICY "Allow read access to projects"
    ON projects FOR SELECT
    USING (true);

CREATE POLICY "Allow insert access to projects"
    ON projects FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow update access to projects"
    ON projects FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow delete access to projects"
    ON projects FOR DELETE
    USING (true);

-- Trigger for updated_at
CREATE TRIGGER projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
