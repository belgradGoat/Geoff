-- Chain orchestration tables for multi-stage agentic workflows
-- Supports Research chains (deep_research → gap_analysis → refinement → polish)
-- and Development chains (planning → implementation → qc_review → documentation)

-- chain_templates: stores built-in + custom chain definitions
CREATE TABLE IF NOT EXISTS chain_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    chain_type TEXT NOT NULL,
    description TEXT,
    stages JSONB NOT NULL DEFAULT '[]',
    default_config JSONB DEFAULT '{}',
    is_builtin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chain_templates_chain_type ON chain_templates(chain_type);
CREATE INDEX IF NOT EXISTS idx_chain_templates_is_builtin ON chain_templates(is_builtin);

-- chain_executions: a running/completed chain instance linked to a task
CREATE TABLE IF NOT EXISTS chain_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES chain_templates(id),
    chain_type TEXT NOT NULL,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    config JSONB DEFAULT '{}',
    context JSONB DEFAULT '{}',
    current_stage_index INTEGER DEFAULT 0,
    total_stages INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chain_executions_task_id ON chain_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_chain_executions_status ON chain_executions(status);
CREATE INDEX IF NOT EXISTS idx_chain_executions_project_id ON chain_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_chain_executions_chain_type ON chain_executions(chain_type);

-- chain_stages: individual stage execution records
CREATE TABLE IF NOT EXISTS chain_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_execution_id UUID NOT NULL REFERENCES chain_executions(id) ON DELETE CASCADE,
    stage_index INTEGER NOT NULL,
    stage_name TEXT NOT NULL,
    stage_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    agent_id TEXT,
    prompt_used TEXT,
    result TEXT,
    result_data JSONB DEFAULT '{}',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chain_stages_execution_id ON chain_stages(chain_execution_id);
CREATE INDEX IF NOT EXISTS idx_chain_stages_status ON chain_stages(status);

-- Auto-update timestamps trigger for chain_templates
CREATE TRIGGER chain_templates_updated_at
    BEFORE UPDATE ON chain_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update timestamps trigger for chain_executions
CREATE TRIGGER chain_executions_updated_at
    BEFORE UPDATE ON chain_executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable RLS
ALTER TABLE chain_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_stages ENABLE ROW LEVEL SECURITY;

-- Permissive RLS policies (matching existing pattern)
CREATE POLICY "Allow all on chain_templates" ON chain_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on chain_executions" ON chain_executions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on chain_stages" ON chain_stages FOR ALL USING (true) WITH CHECK (true);

-- Seed built-in templates
INSERT INTO chain_templates (name, chain_type, description, stages, default_config, is_builtin) VALUES
(
    'Research Chain',
    'research',
    'Multi-stage research workflow: deep research, gap analysis, refinement, and polish',
    '[
        {"name": "deep_research", "stage_type": "research", "description": "Comprehensive research on the topic", "is_qc_gate": false},
        {"name": "gap_analysis", "stage_type": "gap_analysis", "description": "Review research for completeness and identify gaps", "is_qc_gate": false},
        {"name": "refinement", "stage_type": "refinement", "description": "Improve document by addressing identified gaps", "is_qc_gate": false},
        {"name": "polish", "stage_type": "polish", "description": "Final polish: formatting, cross-references, citations", "is_qc_gate": false}
    ]'::jsonb,
    '{}'::jsonb,
    true
),
(
    'Development Chain',
    'development',
    'Multi-stage development workflow: planning, implementation, QC review with retry, and documentation',
    '[
        {"name": "planning", "stage_type": "planning", "description": "Create detailed implementation plan", "is_qc_gate": false},
        {"name": "implementation", "stage_type": "working", "description": "Implement changes described in the plan", "is_qc_gate": false},
        {"name": "qc_review", "stage_type": "qc", "description": "Review implementation for correctness and quality", "is_qc_gate": true, "retry_target_stage": "implementation", "max_qc_iterations": 3},
        {"name": "documentation", "stage_type": "docs", "description": "Update documentation to reflect changes", "is_qc_gate": false}
    ]'::jsonb,
    '{}'::jsonb,
    true
);

COMMENT ON TABLE chain_templates IS 'Built-in and custom chain workflow definitions';
COMMENT ON TABLE chain_executions IS 'Running/completed chain instances linked to tasks';
COMMENT ON TABLE chain_stages IS 'Individual stage execution records within a chain';
