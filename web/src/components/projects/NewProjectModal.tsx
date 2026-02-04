import { useState, useEffect } from 'react'
import { orchestrator, FileEntry } from '../../lib/orchestrator'

interface NewProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onProjectCreated: (name: string, path: string) => Promise<void>
  defaultBasePath?: string
}

export function NewProjectModal({ isOpen, onClose, onProjectCreated, defaultBasePath }: NewProjectModalProps) {
  const [projectName, setProjectName] = useState('')
  const [currentPath, setCurrentPath] = useState<string>('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [quickPaths, setQuickPaths] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setProjectName('')
      setError(null)
      loadQuickPaths()
      browse(defaultBasePath || undefined)
    }
  }, [isOpen, defaultBasePath])

  const loadQuickPaths = async () => {
    try {
      const response = await orchestrator.getQuickPaths()
      setQuickPaths(response.paths)
    } catch (e) {
      console.error('Failed to load quick paths:', e)
    }
  }

  const browse = async (path?: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await orchestrator.browseDirectory(path)
      setCurrentPath(response.current_path)
      setParentPath(response.parent_path)
      setEntries(response.entries)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!projectName.trim() || !currentPath) return

    setCreating(true)
    setError(null)

    try {
      // Create the folder
      const createResponse = await orchestrator.createDirectory(currentPath, projectName.trim())

      // Add the project to the database
      await onProjectCreated(projectName.trim(), createResponse.path)

      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && projectName.trim() && currentPath) {
      handleCreate()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-geoff-card rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col border border-geoff-border">
        {/* Header */}
        <div className="p-4 border-b border-geoff-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-geoff-text">New Project</h3>
            <button
              onClick={onClose}
              className="text-geoff-text-muted hover:text-geoff-text transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Project name input */}
          <div>
            <label className="block text-xs text-geoff-text-muted mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="my-new-project"
              className="input w-full text-sm"
              autoFocus
            />
          </div>

          {/* Quick paths */}
          {quickPaths.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {quickPaths.map((qp) => (
                <button
                  key={qp.path}
                  onClick={() => browse(qp.path)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    currentPath === qp.path
                      ? 'bg-geoff-accent text-white'
                      : 'bg-geoff-surface text-geoff-text-muted hover:bg-geoff-border'
                  }`}
                >
                  {qp.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current path */}
        <div className="px-4 py-2 bg-geoff-surface border-b border-geoff-border">
          <div className="flex items-center gap-2">
            {parentPath && (
              <button
                onClick={() => browse(parentPath)}
                className="p-1 text-geoff-text-muted hover:text-geoff-text hover:bg-geoff-border rounded transition-colors"
                title="Go up"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <span className="text-sm text-geoff-text-muted truncate flex-1 font-mono" title={currentPath}>
              {currentPath}
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-geoff-error-dim text-geoff-error text-sm border-b border-geoff-error/30">
            {error}
          </div>
        )}

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="text-center py-8 text-geoff-text-muted">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-geoff-text-muted">No subdirectories</div>
          ) : (
            <div className="space-y-1">
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => browse(entry.path)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-geoff-surface rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-geoff-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                  <span className="text-sm text-geoff-text truncate">{entry.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Preview */}
        {projectName.trim() && currentPath && (
          <div className="px-4 py-2 bg-geoff-surface border-t border-geoff-border">
            <span className="text-xs text-geoff-text-muted">Will create: </span>
            <span className="text-xs text-geoff-text font-mono">{currentPath}/{projectName.trim()}</span>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-geoff-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-geoff-text-muted hover:text-geoff-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!projectName.trim() || !currentPath || creating}
            className="btn-primary text-sm"
          >
            {creating ? 'Creating...' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
