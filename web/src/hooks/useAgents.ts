import { create } from 'zustand'
import { orchestrator, Agent } from '../lib/orchestrator'

interface AgentsState {
  agents: Agent[]
  loading: boolean
  error: string | null
  selectedAgentId: string | null
  agentOutput: Record<string, string[]>

  // Actions
  fetchAgents: () => Promise<void>
  launchAgent: (prompt: string, workingDir?: string, projectId?: string, provider?: string, taskTitle?: string) => Promise<Agent | null>
  stopAgent: (id: string) => Promise<void>
  selectAgent: (id: string | null) => void
  streamAgentOutput: (id: string) => () => void
}

export const useAgents = create<AgentsState>((set) => ({
  agents: [],
  loading: false,
  error: null,
  selectedAgentId: null,
  agentOutput: {},

  fetchAgents: async () => {
    set({ loading: true, error: null })
    try {
      const response = await orchestrator.listAgents()
      set({ agents: response.agents, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  launchAgent: async (prompt: string, workingDir?: string, projectId?: string, provider?: string, taskTitle?: string) => {
    try {
      // Get provider from localStorage if not specified
      const selectedProvider = provider || localStorage.getItem('geoff-provider') || undefined
      const agent = await orchestrator.launchAgent(prompt, workingDir, projectId, selectedProvider, taskTitle)
      set((state) => ({
        agents: [agent, ...state.agents],
        agentOutput: { ...state.agentOutput, [agent.id]: [] },
      }))
      return agent
    } catch (e) {
      set({ error: (e as Error).message })
      return null
    }
  },

  stopAgent: async (id: string) => {
    try {
      const agent = await orchestrator.stopAgent(id)
      set((state) => ({
        agents: state.agents.map((a) => (a.id === id ? agent : a)),
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  selectAgent: (id: string | null) => {
    set({ selectedAgentId: id })
  },

  streamAgentOutput: (id: string) => {
    const ws = orchestrator.streamAgent(id, (message) => {
      if (message.type === 'output' && message.data) {
        set((state) => ({
          agentOutput: {
            ...state.agentOutput,
            [id]: [...(state.agentOutput[id] || []), message.data!],
          },
        }))
      } else if (message.type === 'done') {
        // Update agent status
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === id
              ? { ...a, status: message.status as Agent['status'], exit_code: message.exit_code ?? null }
              : a
          ),
        }))
      }
    })

    return () => {
      ws.close()
    }
  },
}))
