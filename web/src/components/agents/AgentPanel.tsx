import { useEffect, useRef } from 'react'
import { useAgents } from '../../hooks/useAgents'
import { Agent } from '../../lib/orchestrator'

const statusColors: Record<Agent['status'], string> = {
  starting: 'bg-geoff-warning-dim text-geoff-warning',
  running: 'bg-geoff-success-dim text-geoff-success',
  stopped: 'bg-geoff-card text-geoff-text-muted',
  failed: 'bg-geoff-error-dim text-geoff-error',
}

// Extract task title from agent - prefer task_title field, fallback to prompt parsing
function getTaskTitle(agent: Agent): string | null {
  // First, use the explicit task_title field if available
  if (agent.task_title) {
    return agent.task_title
  }
  // Fallback: extract from prompt for backward compatibility
  const match = agent.prompt.match(/- Title: (.+?)(?:\n|$)/)
  return match ? match[1].trim() : null
}

// Format start time as HH:MM timestamp
function formatStartTime(startedAt: string): string {
  const start = new Date(startedAt)
  return start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface AgentItemProps {
  agent: Agent
  isSelected: boolean
  onSelect: () => void
  onStop: () => void
}

function AgentItem({ agent, isSelected, onSelect, onStop }: AgentItemProps) {
  const taskTitle = getTaskTitle(agent)

  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-lg cursor-pointer border transition-all ${
        isSelected
          ? 'border-geoff-accent bg-geoff-accent-dim'
          : 'border-geoff-border bg-geoff-surface hover:border-geoff-border-light'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-geoff-text">{agent.id.slice(0, 8)}</span>
          <span className="px-1.5 py-0.5 text-xs bg-geoff-card border border-geoff-border rounded text-geoff-text-muted">
            {agent.provider || 'claude'}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[agent.status]}`}>
          {agent.status}
        </span>
      </div>

      {/* Show task name or prompt */}
      <div className="mt-1">
        {taskTitle ? (
          <p className="text-sm text-geoff-text">
            <span className="text-geoff-accent font-medium">Task:</span>{' '}
            <span className="line-clamp-1">{taskTitle}</span>
          </p>
        ) : (
          <p className="text-sm text-geoff-text-muted line-clamp-1">{agent.prompt}</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-geoff-text-muted">
          <span className="text-geoff-success">Started at:</span>{' '}
          <span className="font-medium">{formatStartTime(agent.started_at)}</span>
        </span>
        {agent.status === 'running' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStop()
            }}
            className="px-2 py-0.5 text-xs border border-geoff-error/30 text-geoff-error rounded hover:bg-geoff-error-dim transition-colors"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  )
}

function AgentOutput({ agentId }: { agentId: string }) {
  const agentOutput = useAgents((state) => state.agentOutput)
  const streamAgentOutput = useAgents((state) => state.streamAgentOutput)
  const outputRef = useRef<HTMLDivElement>(null)
  const lines = agentOutput[agentId] || []

  useEffect(() => {
    const unsubscribe = streamAgentOutput(agentId)
    return unsubscribe
    // streamAgentOutput is stable from zustand, only reconnect when agentId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

  return (
    <div
      ref={outputRef}
      className="bg-geoff-bg border border-geoff-border text-geoff-text p-4 rounded-lg h-64 overflow-y-auto font-mono text-sm"
    >
      {lines.length === 0 ? (
        <span className="text-geoff-text-dim">Waiting for output...</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap">
            {line}
          </div>
        ))
      )}
    </div>
  )
}

export function AgentPanel() {
  const {
    agents,
    loading,
    error,
    selectedAgentId,
    fetchAgents,
    stopAgent,
    selectAgent,
  } = useAgents()

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 5000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  // Only show active sessions (starting or running), not stopped/failed
  const activeSessions = agents.filter((a) => a.status === 'starting' || a.status === 'running')

  return (
    <div className="card p-4">
      <h2 className="text-lg font-semibold text-geoff-text mb-4">Active Sessions</h2>

      {error && (
        <div className="p-3 bg-geoff-error-dim border border-geoff-error/30 rounded-lg text-geoff-error text-sm mb-4">
          {error}
        </div>
      )}

      {/* Agent list */}
      <div className="space-y-2 mb-4">
        {loading && agents.length === 0 ? (
          <div className="text-geoff-text-muted text-center py-4">Loading sessions...</div>
        ) : activeSessions.length === 0 ? (
          <div className="text-geoff-text-muted text-center py-4">No active sessions</div>
        ) : (
          activeSessions.map((agent) => (
            <AgentItem
              key={agent.id}
              agent={agent}
              isSelected={selectedAgentId === agent.id}
              onSelect={() => selectAgent(agent.id)}
              onStop={() => stopAgent(agent.id)}
            />
          ))
        )}
      </div>

      {/* Agent output */}
      {selectedAgent && (
        <div>
          <h3 className="text-sm font-medium text-geoff-text-muted mb-2">
            Output: <span className="font-mono text-geoff-accent">{selectedAgent.id.slice(0, 8)}</span>
          </h3>
          <AgentOutput agentId={selectedAgent.id} />
        </div>
      )}
    </div>
  )
}
