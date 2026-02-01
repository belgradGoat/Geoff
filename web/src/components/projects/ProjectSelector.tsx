import { useState } from 'react'
import { useProjects } from '../../hooks/useProjects'
import { useTasks } from '../../hooks/useTasks'

export function ProjectSelector() {
  const {
    projects,
    scannedProjects,
    basePath,
    loading,
    scanning,
    error,
    scanDirectory,
    syncProjects,
    clearScanned,
    setBasePath,
  } = useProjects()
  const { projectFilter, setProjectFilter } = useTasks()
  const [showScanner, setShowScanner] = useState(false)
  const [inputPath, setInputPath] = useState(basePath || '')

  const handleScan = async () => {
    if (!inputPath.trim()) return
    setBasePath(inputPath.trim())
    await scanDirectory(inputPath.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan()
    }
  }

  const handleSyncAll = async () => {
    await syncProjects()
  }

  const handleSyncOne = async (path: string) => {
    await syncProjects([path])
  }

  const selectedProject = projects.find((p) => p.id === projectFilter)
  const newProjects = scannedProjects.filter((sp) => !sp.exists_in_db)

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-geoff-text">Project</h2>
        <button
          onClick={() => setShowScanner(!showScanner)}
          className="text-xs text-geoff-accent hover:text-geoff-accent-hover transition-colors"
        >
          {showScanner ? 'Close' : 'Scan Folder'}
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-geoff-error-dim border border-geoff-error/30 rounded-lg text-geoff-error text-xs">
          {error}
        </div>
      )}

      {showScanner && (
        <div className="mb-3 p-3 bg-geoff-surface rounded-lg border border-geoff-border space-y-3">
          <div>
            <label className="block text-xs text-geoff-text-muted mb-1">
              Paste folder path containing your projects:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="/Users/you/Documents/GitHub"
                className="input flex-1 text-sm"
              />
              <button
                onClick={handleScan}
                disabled={scanning || !inputPath.trim()}
                className="btn-primary text-sm"
              >
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
            </div>
            <p className="mt-1 text-xs text-geoff-text-dim">
              Tip: In Finder, right-click folder → "Copy as Pathname"
            </p>
          </div>

          {newProjects.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-geoff-text-muted">
                  Found {newProjects.length} new project{newProjects.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={handleSyncAll}
                  disabled={loading}
                  className="text-xs text-geoff-success hover:text-geoff-success/80 font-medium transition-colors"
                >
                  {loading ? 'Importing...' : 'Import All'}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {newProjects.map((sp) => (
                  <div
                    key={sp.path}
                    className="flex items-center justify-between p-2 bg-geoff-card border border-geoff-border rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-geoff-text text-sm truncate">{sp.name}</div>
                      <div className="text-xs text-geoff-text-dim truncate">{sp.markers.join(', ')}</div>
                    </div>
                    <button
                      onClick={() => handleSyncOne(sp.path)}
                      disabled={loading}
                      className="ml-2 px-2 py-0.5 text-xs border border-geoff-success/30 text-geoff-success rounded hover:bg-geoff-success-dim transition-colors"
                    >
                      Import
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={clearScanned}
                className="text-xs text-geoff-text-dim hover:text-geoff-text-muted transition-colors"
              >
                Clear
              </button>
            </div>
          )}

          {scannedProjects.length > 0 && newProjects.length === 0 && (
            <div className="text-xs text-geoff-text-dim text-center py-2">
              All {scannedProjects.length} projects already imported
            </div>
          )}

          {!scanning && scannedProjects.length === 0 && basePath && (
            <div className="text-xs text-geoff-text-dim text-center py-2">
              No projects found in this folder.
            </div>
          )}
        </div>
      )}

      <select
        value={projectFilter || ''}
        onChange={(e) => setProjectFilter(e.target.value || null)}
        className="input text-sm"
        disabled={loading}
      >
        <option value="">All Projects</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>

      {selectedProject && (
        <div className="mt-2 text-xs text-geoff-text-dim truncate font-mono" title={selectedProject.path}>
          {selectedProject.path}
        </div>
      )}
    </div>
  )
}
