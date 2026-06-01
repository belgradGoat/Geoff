import { useState, useEffect } from 'react'
import { useChains, ChainExecution, ChainStage } from '../../hooks/useChains'

const stageStatusConfig: Record<string, { icon: string; color: string; bg: string }> = {
  pending: { icon: '', color: 'text-geoff-text-dim', bg: 'bg-geoff-card' },
  running: { icon: '', color: 'text-geoff-warning', bg: 'bg-geoff-warning-dim' },
  completed: { icon: '', color: 'text-geoff-success', bg: 'bg-geoff-success-dim' },
  failed: { icon: '', color: 'text-geoff-error', bg: 'bg-geoff-error-dim' },
  skipped: { icon: '', color: 'text-geoff-text-dim', bg: 'bg-geoff-card' },
}

function StageIcon({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (status === 'running') {
    return (
      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    )
  }
  if (status === 'failed') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  }
  if (status === 'skipped') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
      </svg>
    )
  }
  // pending
  return <div className="w-2 h-2 rounded-full bg-geoff-text-dim" />
}

function formatStageName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

interface ChainProgressProps {
  execution: ChainExecution
  compact?: boolean
}

export function ChainProgress({ execution, compact = true }: ChainProgressProps) {
  const { fetchExecution, getStagesForExecution } = useChains()
  const stages = getStagesForExecution(execution.id)
  const [expandedStage, setExpandedStage] = useState<string | null>(null)

  useEffect(() => {
    // Fetch stages when component mounts or execution updates
    fetchExecution(execution.id)
  }, [execution.id, execution.status, execution.current_stage_index])

  // Poll for updates while running
  useEffect(() => {
    if (execution.status !== 'running' && execution.status !== 'pending') return
    const interval = setInterval(() => fetchExecution(execution.id), 5000)
    return () => clearInterval(interval)
  }, [execution.id, execution.status])

  if (compact) {
    return (
      <div className="mt-2 ml-6">
        {/* Chain type label */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-geoff-accent">
            {execution.chain_type === 'research' ? 'Research Chain' : execution.chain_type === 'osint' ? 'OSINT Chain' : 'Development Chain'}
          </span>
          {execution.status === 'running' && (
            <span className="text-xs text-geoff-warning">Running</span>
          )}
          {execution.status === 'completed' && (
            <span className="text-xs text-geoff-success">Completed</span>
          )}
          {execution.status === 'failed' && (
            <span className="text-xs text-geoff-error">Failed</span>
          )}
        </div>

        {/* Pipeline visualization */}
        <div className="flex items-center gap-1">
          {stages.map((stage, index) => {
            const config = stageStatusConfig[stage.status as string] || stageStatusConfig.pending
            const isBackground = stage.result_data?.is_background === true
            const isOutputStage = stage.result_data?.is_output_stage === true
            return (
              <div key={stage.id} className="flex items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpandedStage(expandedStage === stage.id ? null : stage.id)
                  }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${config.bg} ${config.color} hover:opacity-80 ${isBackground ? 'opacity-50' : ''} ${isOutputStage ? 'ring-1 ring-geoff-accent' : ''}`}
                  title={`${formatStageName(stage.stage_name)}: ${stage.status}${isBackground ? ' (background)' : ''}${isOutputStage ? ' (output)' : ''}${stage.retry_count > 0 ? ` (retry ${stage.retry_count})` : ''}`}
                >
                  <StageIcon status={stage.status as string} />
                  <span className="hidden sm:inline">{formatStageName(stage.stage_name)}</span>
                </button>
                {index < stages.length - 1 && (
                  <svg className="w-3 h-3 text-geoff-text-dim mx-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            )
          })}
        </div>

        {/* Expanded stage details */}
        {expandedStage && (
          <StageDetail
            stage={stages.find((s) => s.id === expandedStage)}
            onClose={() => setExpandedStage(null)}
          />
        )}

        {/* Error message */}
        {execution.error_message && (
          <div className="mt-1 text-xs text-geoff-error truncate">
            {execution.error_message}
          </div>
        )}
      </div>
    )
  }

  // Full expanded view
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-geoff-text">
          {execution.chain_type === 'research' ? 'Research Chain' : 'Development Chain'}
        </h4>
        <span className={`text-xs px-2 py-0.5 rounded ${
          stageStatusConfig[execution.status as string]?.bg || 'bg-geoff-card'
        } ${stageStatusConfig[execution.status as string]?.color || 'text-geoff-text-dim'}`}>
          {execution.status}
        </span>
      </div>

      <div className="space-y-1">
        {stages.map((stage) => {
          const config = stageStatusConfig[stage.status as string] || stageStatusConfig.pending
          return (
            <div key={stage.id}>
              <button
                onClick={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
                className={`w-full flex items-center justify-between p-2 rounded transition-colors ${config.bg} hover:opacity-80`}
              >
                <div className="flex items-center gap-2">
                  <span className={config.color}>
                    <StageIcon status={stage.status as string} />
                  </span>
                  <span className={`text-sm ${config.color}`}>
                    {formatStageName(stage.stage_name)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {stage.retry_count > 0 && (
                    <span className="text-xs text-geoff-warning">Retry {stage.retry_count}</span>
                  )}
                  <span className={`text-xs ${config.color}`}>{stage.status}</span>
                </div>
              </button>

              {expandedStage === stage.id && (
                <StageDetail stage={stage} onClose={() => setExpandedStage(null)} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StageDetail({ stage, onClose }: { stage?: ChainStage; onClose: () => void }) {
  if (!stage) return null

  return (
    <div className="mt-1 ml-4 p-2 bg-geoff-bg border border-geoff-border rounded text-xs" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-start mb-1">
        <span className="font-medium text-geoff-text">{formatStageName(stage.stage_name)}</span>
        <button onClick={onClose} className="text-geoff-text-dim hover:text-geoff-text">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {stage.agent_id && (
        <div className="text-geoff-text-dim">Agent: <span className="font-mono">{stage.agent_id.slice(0, 8)}</span></div>
      )}
      {stage.error_message && (
        <div className="text-geoff-error mt-1">{stage.error_message}</div>
      )}
      {stage.result && (
        <div className="mt-1 max-h-32 overflow-auto">
          <pre className="text-geoff-text-muted whitespace-pre-wrap font-mono">{stage.result.slice(0, 2000)}</pre>
        </div>
      )}
      {stage.started_at && (
        <div className="text-geoff-text-dim mt-1">
          Started: {new Date(stage.started_at).toLocaleString()}
          {stage.completed_at && ` | Completed: ${new Date(stage.completed_at).toLocaleString()}`}
        </div>
      )}
    </div>
  )
}
