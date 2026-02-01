import { useState, useEffect } from 'react'
import { orchestrator, DirectoryEntry } from '../../lib/orchestrator'

interface FolderBrowserProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (path: string) => void
}

export function FolderBrowser({ isOpen, onClose, onSelect }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [quickPaths, setQuickPaths] = useState<DirectoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadQuickPaths()
      browse(undefined) // Start at home
    }
  }, [isOpen])

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

  const handleSelect = () => {
    onSelect(currentPath)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">Select Folder</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Quick paths */}
          {quickPaths.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {quickPaths.map((qp) => (
                <button
                  key={qp.path}
                  onClick={() => browse(qp.path)}
                  className={`px-2 py-1 text-xs rounded ${
                    currentPath === qp.path
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {qp.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current path */}
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {parentPath && (
              <button
                onClick={() => browse(parentPath)}
                className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                title="Go up"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <span className="text-sm text-gray-600 truncate flex-1" title={currentPath}>
              {currentPath}
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-red-50 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No subdirectories</div>
          ) : (
            <div className="space-y-1">
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => browse(entry.path)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                  <span className="text-sm text-gray-700 truncate">{entry.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSelect}
            disabled={!currentPath}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Select This Folder
          </button>
        </div>
      </div>
    </div>
  )
}
