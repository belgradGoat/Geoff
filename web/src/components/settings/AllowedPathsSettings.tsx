import { useState, useEffect } from 'react'
import { orchestrator } from '../../lib/orchestrator'

export function AllowedPathsSettings() {
  const [paths, setPaths] = useState<string[]>([])
  const [restricted, setRestricted] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    loadAllowedPaths()
  }, [])

  const loadAllowedPaths = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await orchestrator.getAllowedPaths()
      setPaths(response.paths)
      setRestricted(response.restricted)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddPath = async () => {
    if (!newPath.trim()) return

    setAdding(true)
    setError(null)
    try {
      const response = await orchestrator.addAllowedPath(newPath.trim())
      setPaths(response.paths)
      setRestricted(response.restricted)
      setNewPath('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const handleRemovePath = async (path: string) => {
    setError(null)
    try {
      const response = await orchestrator.removeAllowedPath(path)
      setPaths(response.paths)
      setRestricted(response.restricted)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !adding) {
      handleAddPath()
    }
  }

  if (loading) {
    return (
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-geoff-text mb-4">Allowed Paths</h2>
        <div className="text-geoff-text-muted">Loading...</div>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-geoff-text">Allowed Paths</h2>
        {restricted ? (
          <span className="px-2 py-0.5 text-xs bg-geoff-success-dim text-geoff-success rounded">
            Restricted
          </span>
        ) : (
          <span className="px-2 py-0.5 text-xs bg-geoff-warning-dim text-geoff-warning rounded">
            Unrestricted
          </span>
        )}
      </div>

      <p className="text-sm text-geoff-text-muted mb-4">
        Limit file browser access to specific directories and their subdirectories.
        {!restricted && ' Currently, all directories are accessible.'}
      </p>

      {error && (
        <div className="p-3 bg-geoff-error-dim border border-geoff-error/30 rounded-lg text-geoff-error text-sm mb-4">
          {error}
        </div>
      )}

      {/* Add new path */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste directory path (e.g., /Users/you/Projects)"
          className="input flex-1 font-mono text-sm"
          disabled={adding}
        />
        <button
          onClick={handleAddPath}
          disabled={adding || !newPath.trim()}
          className="btn-primary whitespace-nowrap"
        >
          {adding ? 'Adding...' : 'Add Path'}
        </button>
      </div>

      {/* Path list */}
      <div className="space-y-2">
        {paths.length === 0 ? (
          <div className="text-sm text-geoff-text-dim py-4 text-center border border-dashed border-geoff-border rounded-lg">
            No paths configured. Add a path above to restrict file browser access.
          </div>
        ) : (
          paths.map((path) => (
            <div
              key={path}
              className="flex items-center justify-between p-3 bg-geoff-surface border border-geoff-border rounded-lg group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-geoff-accent">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </span>
                <span className="font-mono text-sm text-geoff-text truncate">{path}</span>
              </div>
              <button
                onClick={() => handleRemovePath(path)}
                className="text-geoff-text-dim hover:text-geoff-error transition-colors opacity-0 group-hover:opacity-100"
                title="Remove path"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Info notice */}
      <div className="mt-4 p-3 bg-geoff-card border border-geoff-border rounded-lg">
        <p className="text-xs text-geoff-text-muted">
          <strong>How it works:</strong> When paths are configured, the file browser can only access
          these directories and their subdirectories. Agents will also be restricted to these paths.
          Remove all paths to allow unrestricted access.
        </p>
      </div>
    </div>
  )
}
