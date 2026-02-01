import { useEffect } from 'react'
import { useTasks } from './hooks/useTasks'
import { useProjects } from './hooks/useProjects'
import { QuickAdd } from './components/tasks/QuickAdd'
import { TaskList } from './components/tasks/TaskList'
import { TaskDetail } from './components/tasks/TaskDetail'
import { AgentPanel } from './components/agents/AgentPanel'
import { ProjectSelector } from './components/projects/ProjectSelector'

function App() {
  const { fetchTasks, subscribeToChanges, selectedTaskId, projectFilter } = useTasks()
  const { fetchProjects, selectedProjectId } = useProjects()

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
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agent Task Planner</h1>
            {selectedProject && (
              <p className="text-sm text-gray-500">{selectedProject.name}</p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
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
      </main>
    </div>
  )
}

export default App
