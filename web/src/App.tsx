import { useEffect, useState } from 'react'
import { useTasks } from './hooks/useTasks'
import { useProjects } from './hooks/useProjects'
import { QuickAdd } from './components/tasks/QuickAdd'
import { TaskList } from './components/tasks/TaskList'
import { TaskDetail } from './components/tasks/TaskDetail'
import { AgentPanel } from './components/agents/AgentPanel'
import { ProjectSelector } from './components/projects/ProjectSelector'
import { FileBrowser } from './components/files/FileBrowser'
import { RemoteAccess } from './components/settings/RemoteAccess'

type Tab = 'tasks' | 'files' | 'settings'

function App() {
  const { fetchTasks, subscribeToChanges, selectedTaskId, projectFilter } = useTasks()
  const { fetchProjects } = useProjects()
  const [activeTab, setActiveTab] = useState<Tab>('tasks')

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    fetchTasks()
    const unsubscribe = subscribeToChanges()
    return unsubscribe
  }, [fetchTasks, subscribeToChanges])

  const selectedProject = useProjects.getState().projects.find(p => p.id === projectFilter)

  return (
    <div className="min-h-screen bg-geoff-bg">
      {/* Header */}
      <header className="bg-geoff-surface border-b border-geoff-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Geoff" className="w-10 h-10 rounded-xl" />
                <div>
                  <h1 className="text-xl font-bold text-geoff-text">Geoff</h1>
                  {selectedProject && (
                    <p className="text-xs text-geoff-text-muted">{selectedProject.name}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Tab navigation */}
            <nav className="flex gap-1 bg-geoff-card p-1 rounded-xl border border-geoff-border">
              <button
                onClick={() => setActiveTab('tasks')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'tasks'
                    ? 'bg-geoff-accent text-white'
                    : 'text-geoff-text-muted hover:text-geoff-text hover:bg-geoff-surface'
                }`}
              >
                Tasks
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'files'
                    ? 'bg-geoff-accent text-white'
                    : 'text-geoff-text-muted hover:text-geoff-text hover:bg-geoff-surface'
                }`}
              >
                Files
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'settings'
                    ? 'bg-geoff-accent text-white'
                    : 'text-geoff-text-muted hover:text-geoff-text hover:bg-geoff-surface'
                }`}
              >
                Settings
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            {/* Project selector at top */}
            <ProjectSelector />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Tasks column */}
              <div className="lg:col-span-2 space-y-6">
                <QuickAdd />
                <TaskList />
              </div>

              {/* Right sidebar */}
              <div className="space-y-6">
                {selectedTaskId ? <TaskDetail /> : null}
                <AgentPanel />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-6">
            <ProjectSelector />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <FileBrowser />
              </div>
              <div className="space-y-6">
                <AgentPanel />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <ProjectSelector />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RemoteAccess />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
