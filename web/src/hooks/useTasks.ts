import { create } from 'zustand'
import { supabase, Task, TaskStatus } from '../lib/supabase'

interface TasksState {
  tasks: Task[]
  loading: boolean
  error: string | null
  selectedTaskId: string | null
  projectFilter: string | null

  // Actions
  fetchTasks: (projectId?: string | null) => Promise<void>
  addTask: (title: string, priority?: number, description?: string, projectId?: string | null) => Promise<Task | null>
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  selectTask: (id: string | null) => void
  setProjectFilter: (projectId: string | null) => void
  subscribeToChanges: () => () => void
}

export const useTasks = create<TasksState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  selectedTaskId: null,
  projectFilter: null,

  fetchTasks: async (projectId?: string | null) => {
    set({ loading: true, error: null })
    try {
      let query = supabase
        .from('tasks')
        .select('*, projects(id, name, path)')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })

      // Use provided projectId or current filter
      const filterProjectId = projectId !== undefined ? projectId : get().projectFilter
      if (filterProjectId) {
        query = query.eq('project_id', filterProjectId)
      }

      const { data, error } = await query

      if (error) throw error
      set({ tasks: data || [], loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  addTask: async (title: string, priority = 0, description?: string, projectId?: string | null) => {
    try {
      const currentProjectFilter = get().projectFilter
      const taskProjectId = projectId !== undefined ? projectId : currentProjectFilter

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title,
          priority,
          description,
          status: 'ready' as TaskStatus,
          project_id: taskProjectId,
        })
        .select('*, projects(id, name, path)')
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

  setProjectFilter: (projectId: string | null) => {
    set({ projectFilter: projectId })
    // Refetch tasks with new filter
    get().fetchTasks(projectId)
  },

  subscribeToChanges: () => {
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload
          const projectFilter = get().projectFilter

          set((state) => {
            switch (eventType) {
              case 'INSERT': {
                const newTask = newRecord as Task
                // Only add if matches current project filter
                if (projectFilter && newTask.project_id !== projectFilter) {
                  return state
                }
                // Check if task already exists (we may have added it optimistically)
                if (state.tasks.some((t) => t.id === newTask.id)) {
                  return state
                }
                return { tasks: [newTask, ...state.tasks] }
              }

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
