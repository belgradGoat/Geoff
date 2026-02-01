import { useState, useEffect, useRef } from 'react'
import { useAgents } from '../../hooks/useAgents'
import { useTasks } from '../../hooks/useTasks'
import { useProjects } from '../../hooks/useProjects'
import { Agent } from '../../lib/orchestrator'

const statusColors: Record<Agent['status'], string> = {
  starting: 'bg-geoff-warning-dim text-geoff-warning',
  running: 'bg-geoff-success-dim text-geoff-success',
  stopped: 'bg-geoff-card text-geoff-text-muted',
  failed: 'bg-geoff-error-dim text-geoff-error',
}

interface AgentItemProps {
  agent: Agent
  isSelected: boolean
  onSelect: () => void
  onStop: () => void
}

function AgentItem({ agent, isSelected, onSelect, onStop }: AgentItemProps) {
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
        <span className="font-mono text-sm text-geoff-text">{agent.id.slice(0, 8)}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[agent.status]}`}>
          {agent.status}
        </span>
      </div>
      <p className="text-sm text-geoff-text-muted mt-1 line-clamp-1">{agent.prompt}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-geoff-text-dim">
          {new Date(agent.started_at).toLocaleTimeString()}
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
  const { agentOutput, streamAgentOutput } = useAgents()
  const outputRef = useRef<HTMLDivElement>(null)
  const lines = agentOutput[agentId] || []

  useEffect(() => {
    const unsubscribe = streamAgentOutput(agentId)
    return unsubscribe
  }, [agentId, streamAgentOutput])

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
    launchAgent,
    stopAgent,
    selectAgent,
  } = useAgents()

  const { projectFilter } = useTasks()
  const { projects } = useProjects()
  const selectedProject = projects.find(p => p.id === projectFilter)

  const [prompt, setPrompt] = useState('')
  const [workingDir, setWorkingDir] = useState('')
  const [isLaunching, setIsLaunching] = useState(false)

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 5000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  const handleLaunch = async () => {
    if (!prompt.trim()) return
    setIsLaunching(true)
    try {
      const agent = await launchAgent(
        prompt.trim(),
        workingDir || undefined,
        projectFilter || undefined
      )
      if (agent) {
        selectAgent(agent.id)
        setPrompt('')
        setWorkingDir('')
      }
    } finally {
      setIsLaunching(false)
    }
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  return (
    <div className="card p-4">
      <h2 className="text-lg font-semibold text-geoff-text mb-4">Agent Orchestrator</h2>

      {/* Launch form */}
      <div className="space-y-3 mb-6">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter prompt for the agent..."
          rows={2}
          className="input resize-none"
        />
        {selectedProject ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 bg-geoff-surface border border-geoff-border rounded-lg text-sm text-geoff-text-muted truncate">
              Project: {selectedProject.name}
            </div>
            <button
              onClick={handleLaunch}
              disabled={isLaunching || !prompt.trim()}
              className="btn-primary"
            >
              {isLaunching ? 'Launching...' : 'Launch'}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder="Working directory (or select a project)"
              className="input flex-1"
            />
            <button
              onClick={handleLaunch}
              disabled={isLaunching || !prompt.trim()}
              className="btn-primary"
            >
              {isLaunching ? 'Launching...' : 'Launch'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-geoff-error-dim border border-geoff-error/30 rounded-lg text-geoff-error text-sm mb-4">
          {error}
        </div>
      )}

      {/* Agent list */}
      <div className="space-y-2 mb-4">
        {loading && agents.length === 0 ? (
          <div className="text-geoff-text-muted text-center py-4">Loading agents...</div>
        ) : agents.length === 0 ? (
          <div className="text-geoff-text-muted text-center py-4">No agents running</div>
        ) : (
          agents.map((agent) => (
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
