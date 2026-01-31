import { useState, useEffect, useRef } from 'react'
import { useAgents } from '../../hooks/useAgents'
import { Agent } from '../../lib/orchestrator'

const statusColors: Record<Agent['status'], string> = {
  starting: 'bg-yellow-100 text-yellow-600',
  running: 'bg-green-100 text-green-600',
  stopped: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-600',
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
      className={`p-3 rounded-lg cursor-pointer border transition-colors ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-gray-900">{agent.id.slice(0, 8)}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[agent.status]}`}>
          {agent.status}
        </span>
      </div>
      <p className="text-sm text-gray-500 mt-1 line-clamp-1">{agent.prompt}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">
          {new Date(agent.started_at).toLocaleTimeString()}
        </span>
        {agent.status === 'running' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStop()
            }}
            className="px-2 py-0.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
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
      className="bg-gray-900 text-gray-100 p-4 rounded-lg h-64 overflow-y-auto font-mono text-sm"
    >
      {lines.length === 0 ? (
        <span className="text-gray-500">Waiting for output...</span>
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
      const agent = await launchAgent(prompt.trim(), workingDir || undefined)
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Agent Orchestrator</h2>

      {/* Launch form */}
      <div className="space-y-3 mb-6">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter prompt for the agent..."
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={workingDir}
            onChange={(e) => setWorkingDir(e.target.value)}
            placeholder="Working directory (optional)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleLaunch}
            disabled={isLaunching || !prompt.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLaunching ? 'Launching...' : 'Launch Agent'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Agent list */}
      <div className="space-y-2 mb-4">
        {loading && agents.length === 0 ? (
          <div className="text-gray-500 text-center py-4">Loading agents...</div>
        ) : agents.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No agents running</div>
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
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Output: {selectedAgent.id.slice(0, 8)}
          </h3>
          <AgentOutput agentId={selectedAgent.id} />
        </div>
      )}
    </div>
  )
}
