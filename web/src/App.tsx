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
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Agent Task Planner</h1>
              {selectedProject && (
                <p className="text-sm text-gray-500">{selectedProject.name}</p>
              )}
            </div>

            {/* Tab navigation */}
            <nav className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('tasks')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'tasks'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Tasks
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'files'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Files
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tasks column */}
            <div className="lg:col-span-2 space-y-6">
              <QuickAdd />
              <TaskList />
            </div>

            {/* Right sidebar */}
            <div className="space-y-6">
              <ProjectSelector />
              {selectedTaskId ? <TaskDetail /> : null}
              <AgentPanel />
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <FileBrowser />
            </div>
            <div className="space-y-6">
              <ProjectSelector />
              <AgentPanel />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RemoteAccess />
            <div className="space-y-6">
              <ProjectSelector />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
