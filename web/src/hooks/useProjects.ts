import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { orchestrator, Project, ScannedProject } from '../lib/orchestrator'

interface ProjectsState {
  projects: Project[]
  scannedProjects: ScannedProject[]
  basePath: string
  loading: boolean
  scanning: boolean
  error: string | null
  selectedProjectId: string | null

  // Actions
  fetchProjects: () => Promise<void>
  scanDirectory: (basePath: string) => Promise<void>
  syncProjects: (projectPaths?: string[]) => Promise<void>
  addProject: (name: string, path: string, description?: string) => Promise<Project | null>
  selectProject: (id: string | null) => void
  setBasePath: (path: string) => void
  clearScanned: () => void
}

export const useProjects = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],
      scannedProjects: [],
      basePath: '',
      loading: false,
      scanning: false,
      error: null,
      selectedProjectId: null,

      fetchProjects: async () => {
        set({ loading: true, error: null })
        try {
          const response = await orchestrator.listProjects()
          set({ projects: response.projects, loading: false })
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      scanDirectory: async (basePath: string) => {
        set({ scanning: true, error: null, basePath })
        try {
          const response = await orchestrator.scanDirectory(basePath)
          set({ scannedProjects: response.projects, scanning: false })
        } catch (e) {
          set({ error: (e as Error).message, scanning: false, scannedProjects: [] })
        }
      },

      syncProjects: async (projectPaths?: string[]) => {
        const { basePath } = get()
        if (!basePath) {
          set({ error: 'No base path set. Scan a directory first.' })
          return
        }

        set({ loading: true, error: null })
        try {
          const response = await orchestrator.syncProjects(basePath, projectPaths)
          // Refresh the full project list
          const allProjects = await orchestrator.listProjects()
          set({
            projects: allProjects.projects,
            loading: false,
            // Clear scanned that were synced
            scannedProjects: get().scannedProjects.filter(
              (sp) => !response.projects.some((p) => p.path === sp.path)
            ),
          })
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      addProject: async (name: string, path: string, description?: string) => {
        try {
          const project = await orchestrator.createProject(name, path, description)
          set((state) => ({
            projects: [...state.projects, project].sort((a, b) => a.name.localeCompare(b.name)),
          }))
          return project
        } catch (e) {
          set({ error: (e as Error).message })
          return null
        }
      },

      selectProject: (id: string | null) => {
        set({ selectedProjectId: id })
      },

      setBasePath: (path: string) => {
        set({ basePath: path })
      },

      clearScanned: () => {
        set({ scannedProjects: [] })
      },
    }),
    {
      name: 'projects-storage',
      partialize: (state) => ({
        basePath: state.basePath,
        selectedProjectId: state.selectedProjectId,
      }),
    }
  )
)
