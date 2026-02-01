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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Project</h2>
        <button
          onClick={() => setShowScanner(!showScanner)}
          className="text-xs text-blue-600 hover:text-blue-700"
        >
          {showScanner ? 'Close' : 'Scan Folder'}
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
          {error}
        </div>
      )}

      {showScanner && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-3">
          {/* Path input */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Paste folder path containing your projects:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="/Users/you/Documents/GitHub"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleScan}
                disabled={scanning || !inputPath.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Tip: In Finder, right-click folder → "Copy as Pathname"
            </p>
          </div>

          {/* Scanned projects */}
          {newProjects.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">
                  Found {newProjects.length} new project{newProjects.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={handleSyncAll}
                  disabled={loading}
                  className="text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  {loading ? 'Importing...' : 'Import All'}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {newProjects.map((sp) => (
                  <div
                    key={sp.path}
                    className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{sp.name}</div>
                      <div className="text-xs text-gray-500 truncate">{sp.markers.join(', ')}</div>
                    </div>
                    <button
                      onClick={() => handleSyncOne(sp.path)}
                      disabled={loading}
                      className="ml-2 px-2 py-0.5 text-xs border border-green-300 text-green-600 rounded hover:bg-green-50"
                    >
                      Import
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={clearScanned}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            </div>
          )}

          {scannedProjects.length > 0 && newProjects.length === 0 && (
            <div className="text-xs text-gray-500 text-center py-2">
              All {scannedProjects.length} projects already imported
            </div>
          )}

          {!scanning && scannedProjects.length === 0 && basePath && (
            <div className="text-xs text-gray-500 text-center py-2">
              No projects found in this folder.
            </div>
          )}
        </div>
      )}

      {/* Project dropdown */}
      <select
        value={projectFilter || ''}
        onChange={(e) => setProjectFilter(e.target.value || null)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
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
        <div className="mt-2 text-xs text-gray-500 truncate" title={selectedProject.path}>
          {selectedProject.path}
        </div>
      )}
    </div>
  )
}
