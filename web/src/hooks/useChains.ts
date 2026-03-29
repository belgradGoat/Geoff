import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { orchestrator } from '../lib/orchestrator'

export type ChainType = 'research' | 'development' | 'osint'
export type ChainExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ChainStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface ChainTemplate {
  chain_type: string
  name: string
  stages: { name: string; stage_type: string; description: string }[]
  total_stages: number
}

export interface ChainExecution {
  id: string
  template_id: string | null
  chain_type: string
  task_id: string
  project_id: string | null
  status: string
  config: Record<string, unknown>
  context: Record<string, unknown>
  current_stage_index: number
  total_stages: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface ChainStage {
  id: string
  chain_execution_id: string
  stage_index: number
  stage_name: string
  stage_type: string
  status: string
  agent_id: string | null
  result: string | null
  result_data: Record<string, unknown>
  error_message: string | null
  retry_count: number
  max_retries: number
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface ChainsState {
  templates: ChainTemplate[]
  executions: ChainExecution[]
  stagesByExecution: Record<string, ChainStage[]>
  loading: boolean
  error: string | null

  // Actions
  fetchTemplates: () => Promise<void>
  executeChain: (taskId: string, chainType: ChainType, config?: Record<string, unknown>) => Promise<string | null>
  stopChain: (executionId: string) => Promise<void>
  fetchExecutions: (projectId?: string | null, taskId?: string | null) => Promise<void>
  fetchExecution: (executionId: string) => Promise<void>
  getChainForTask: (taskId: string) => ChainExecution | undefined
  getStagesForExecution: (executionId: string) => ChainStage[]
  subscribeToChanges: () => () => void
}

export const useChains = create<ChainsState>()((set, get) => ({
  templates: [],
  executions: [],
  stagesByExecution: {},
  loading: false,
  error: null,

  fetchTemplates: async () => {
    try {
      const response = await orchestrator.getChainTemplates()
      set({ templates: response.templates })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  executeChain: async (taskId: string, chainType: ChainType, config?: Record<string, unknown>) => {
    set({ loading: true, error: null })
    try {
      const response = await orchestrator.executeChain(taskId, chainType, config)
      // Refresh executions
      await get().fetchExecutions()
      set({ loading: false })
      return response.execution_id
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
      return null
    }
  },

  stopChain: async (executionId: string) => {
    try {
      await orchestrator.stopChain(executionId)
      // Refresh executions
      await get().fetchExecutions()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  fetchExecutions: async (projectId?: string | null, taskId?: string | null) => {
    try {
      const response = await orchestrator.getChainExecutions(projectId, taskId)
      set({ executions: response.executions })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  fetchExecution: async (executionId: string) => {
    try {
      const response = await orchestrator.getChainExecution(executionId)
      set((state) => ({
        executions: state.executions.map((e) =>
          e.id === executionId ? response.execution : e
        ),
        stagesByExecution: {
          ...state.stagesByExecution,
          [executionId]: response.stages,
        },
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  getChainForTask: (taskId: string) => {
    return get().executions.find(
      (e) => e.task_id === taskId && e.status !== 'cancelled'
    )
  },

  getStagesForExecution: (executionId: string) => {
    return get().stagesByExecution[executionId] || []
  },

  subscribeToChanges: () => {
    const executionChannel = supabase
      .channel('chain-executions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chain_executions' },
        (payload) => {
          const { eventType, new: newRecord } = payload

          set((state) => {
            switch (eventType) {
              case 'INSERT': {
                const newExec = newRecord as ChainExecution
                if (state.executions.some((e) => e.id === newExec.id)) {
                  return state
                }
                return { executions: [newExec, ...state.executions] }
              }
              case 'UPDATE':
                return {
                  executions: state.executions.map((e) =>
                    e.id === (newRecord as ChainExecution).id
                      ? (newRecord as ChainExecution)
                      : e
                  ),
                }
              default:
                return state
            }
          })
        }
      )
      .subscribe()

    const stageChannel = supabase
      .channel('chain-stages-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chain_stages' },
        (payload) => {
          const { eventType, new: newRecord } = payload

          if (eventType === 'UPDATE' || eventType === 'INSERT') {
            const stage = newRecord as ChainStage
            const executionId = stage.chain_execution_id

            set((state) => {
              const existingStages = state.stagesByExecution[executionId] || []
              const updatedStages = existingStages.some((s) => s.id === stage.id)
                ? existingStages.map((s) => (s.id === stage.id ? stage : s))
                : [...existingStages, stage].sort((a, b) => a.stage_index - b.stage_index)

              return {
                stagesByExecution: {
                  ...state.stagesByExecution,
                  [executionId]: updatedStages,
                },
              }
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(executionChannel)
      supabase.removeChannel(stageChannel)
    }
  },
}))
