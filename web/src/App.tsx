import { useEffect, useState, useRef } from 'react'
import { useTasks } from './hooks/useTasks'
import { useProjects } from './hooks/useProjects'
import { QuickAdd } from './components/tasks/QuickAdd'
import { ActiveTaskList, CompletedTaskList } from './components/tasks/TaskList'
import { AgentPanel } from './components/agents/AgentPanel'
import { ProjectSelector } from './components/projects/ProjectSelector'
import { FileBrowser } from './components/files/FileBrowser'
import { RemoteAccess } from './components/settings/RemoteAccess'
import { ProviderSettings } from './components/settings/ProviderSettings'
import { AllowedPathsSettings } from './components/settings/AllowedPathsSettings'
import { AgentChat } from './components/chat/AgentChat'

type Tab = 'tasks' | 'files' | 'settings' | 'chat'

const tabs: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'chat', label: 'Chat' },
  { id: 'files', label: 'Files' },
  { id: 'settings', label: 'Settings' },
]

function App() {
  const { fetchTasks, subscribeToChanges, projectFilter } = useTasks()
  const { fetchProjects } = useProjects()
  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close mobile menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

            {/* Desktop Tab navigation - hidden on mobile */}
            <nav className="hidden md:flex gap-1 bg-geoff-card p-1 rounded-xl border border-geoff-border">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-geoff-accent text-white'
                      : 'text-geoff-text-muted hover:text-geoff-text hover:bg-geoff-surface'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Mobile hamburger menu */}
            <div className="relative md:hidden" ref={menuRef}>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg bg-geoff-card border border-geoff-border text-geoff-text hover:bg-geoff-surface transition-all"
                aria-label="Menu"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>

              {/* Mobile dropdown menu */}
              {mobileMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-geoff-card border border-geoff-border rounded-xl shadow-lg py-1 z-50">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id)
                        setMobileMenuOpen(false)
                      }}
                      className={`w-full text-left px-4 py-3 text-sm font-medium transition-all ${
                        activeTab === tab.id
                          ? 'bg-geoff-accent text-white'
                          : 'text-geoff-text hover:bg-geoff-surface'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            {/* Project selector at top */}
            <ProjectSelector />

            {/* Quick add form */}
            <QuickAdd />

            {/* Active tasks panel */}
            <ActiveTaskList />

            {/* Active sessions */}
            <AgentPanel />

            {/* Completed tasks panel */}
            <CompletedTaskList />
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
              <ProviderSettings />
              <RemoteAccess />
              <AllowedPathsSettings />
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="space-y-6">
            <ProjectSelector />
            <AgentChat />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
