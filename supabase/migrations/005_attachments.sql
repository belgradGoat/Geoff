-- Add attachments column to tasks
-- Stores array of file attachments as JSONB
-- Each attachment: { name: string, type: string, size: number, data: string (base64) }

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Add index for querying tasks with attachments
CREATE INDEX IF NOT EXISTS idx_tasks_has_attachments
ON tasks ((attachments != '[]'::jsonb));

COMMENT ON COLUMN tasks.attachments IS 'Array of file attachments with base64 data';
