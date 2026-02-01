import { create } from 'zustand'
import { supabase, Project } from '../lib/supabase'

interface ProjectsState {
  projects: Project[]
  loading: boolean
  error: string | null
  selectedProjectId: string | null

  // Actions
  fetchProjects: () => Promise<void>
  addProject: (name: string, path: string, description?: string) => Promise<Project | null>
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  selectProject: (id: string | null) => void
}

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  selectedProjectId: null,

  fetchProjects: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      set({ projects: data || [], loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  addProject: async (name: string, path: string, description?: string) => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name,
          path,
          description,
          is_active: true,
        })
        .select()
        .single()

      if (error) throw error

      set((state) => ({
        projects: [...state.projects, data].sort((a, b) => a.name.localeCompare(b.name)),
      }))

      return data
    } catch (e) {
      set({ error: (e as Error).message })
      return null
    }
  },

  updateProject: async (id: string, updates: Partial<Project>) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)

      if (error) throw error

      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deleteProject: async (id: string) => {
    try {
      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('projects')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error

      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  selectProject: (id: string | null) => {
    set({ selectedProjectId: id })
  },
}))
