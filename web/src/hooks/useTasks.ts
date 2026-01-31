import { create } from 'zustand'
import { supabase, Task, TaskStatus } from '../lib/supabase'

interface TasksState {
  tasks: Task[]
  loading: boolean
  error: string | null
  selectedTaskId: string | null

  // Actions
  fetchTasks: () => Promise<void>
  addTask: (title: string, priority?: number, description?: string) => Promise<Task | null>
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  selectTask: (id: string | null) => void
  subscribeToChanges: () => () => void
}

export const useTasks = create<TasksState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  selectedTaskId: null,

  fetchTasks: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      set({ tasks: data || [], loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  addTask: async (title: string, priority = 0, description?: string) => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title,
          priority,
          description,
          status: 'ready' as TaskStatus,
        })
        .select()
        .single()

      if (error) throw error

      set((state) => ({
        tasks: [data, ...state.tasks],
      }))

      return data
    } catch (e) {
      set({ error: (e as Error).message })
      return null
    }
  },

  updateTask: async (id: string, updates: Partial<Task>) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)

      if (error) throw error

      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id ? { ...t, ...updates } : t
        ),
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deleteTask: async (id: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)

      if (error) throw error

      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== id),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  selectTask: (id: string | null) => {
    set({ selectedTaskId: id })
  },

  subscribeToChanges: () => {
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload

          set((state) => {
            switch (eventType) {
              case 'INSERT':
                // Check if task already exists (we may have added it optimistically)
                if (state.tasks.some((t) => t.id === (newRecord as Task).id)) {
                  return state
                }
                return { tasks: [newRecord as Task, ...state.tasks] }

              case 'UPDATE':
                return {
                  tasks: state.tasks.map((t) =>
                    t.id === (newRecord as Task).id ? (newRecord as Task) : t
                  ),
                }

              case 'DELETE':
                return {
                  tasks: state.tasks.filter((t) => t.id !== (oldRecord as Task).id),
                }

              default:
                return state
            }
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },
}))

// Helper to group tasks by status
export function groupTasksByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = {
    queued: [],
    ready: [],
    assigned: [],
    in_progress: [],
    done: [],
    failed: [],
    blocked: [],
  }

  for (const task of tasks) {
    groups[task.status].push(task)
  }

  return groups
}
