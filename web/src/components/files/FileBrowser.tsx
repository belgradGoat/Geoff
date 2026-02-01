import { useState, useEffect } from 'react'
import { orchestrator, FileEntry, FileContentResponse } from '../../lib/orchestrator'

function formatSize(bytes?: number): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.is_dir) {
    return (
      <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    )
  }

  // File icon based on extension
  const ext = entry.extension || ''
  const codeExts = ['.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h']
  const docExts = ['.md', '.txt', '.doc', '.pdf']
  const configExts = ['.json', '.yaml', '.yml', '.toml', '.env', '.xml']

  if (codeExts.includes(ext)) {
    return (
      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    )
  }

  if (docExts.includes(ext)) {
    return (
      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }

  if (configExts.includes(ext)) {
    return (
      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  }

  return (
    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  )
}

interface FileViewerProps {
  file: FileContentResponse
  onClose: () => void
}

function FileViewer({ file, onClose }: FileViewerProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{file.name}</h3>
            <p className="text-xs text-gray-500">
              {formatSize(file.size)} · {formatDate(file.modified)}
              {file.is_truncated && <span className="text-orange-500 ml-2">(truncated)</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 bg-gray-900">
          <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap">{file.content}</pre>
        </div>
      </div>
    </div>
  )
}

export function FileBrowser() {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [quickPaths, setQuickPaths] = useState<FileEntry[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<FileContentResponse | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [stats, setStats] = useState({ files: 0, dirs: 0 })

  useEffect(() => {
    loadQuickPaths()
    browse(undefined)
  }, [])

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
      const response = await orchestrator.browseDirectory(path, showHidden)
      setCurrentPath(response.current_path)
      setParentPath(response.parent_path)
      setEntries(response.entries)
      setStats({ files: response.total_files, dirs: response.total_dirs })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleEntryClick = async (entry: FileEntry) => {
    if (entry.is_dir) {
      browse(entry.path)
    } else if (entry.is_file) {
      setFileLoading(true)
      try {
        const content = await orchestrator.readFile(entry.path)
        setSelectedFile(content)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setFileLoading(false)
      }
    }
  }

  const toggleHidden = () => {
    setShowHidden(!showHidden)
    // Re-browse with new setting
    setTimeout(() => browse(currentPath), 0)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">File Browser</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={toggleHidden}
              className="rounded border-gray-300"
            />
            Show hidden
          </label>
        </div>

        {/* Quick paths */}
        {quickPaths.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {quickPaths.map((qp) => (
              <button
                key={qp.path}
                onClick={() => browse(qp.path)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
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

        {/* Current path */}
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
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
          <span className="text-sm text-gray-700 truncate flex-1 font-mono" title={currentPath}>
            {currentPath}
          </span>
          <span className="text-xs text-gray-500">
            {stats.dirs} folders, {stats.files} files
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-sm border-b border-red-200">
          {error}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Empty directory</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium w-24">Size</th>
                <th className="px-4 py-2 font-medium w-40">Modified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <tr
                  key={entry.path}
                  onClick={() => handleEntryClick(entry)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <FileIcon entry={entry} />
                      <span className="text-sm text-gray-900 truncate">{entry.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {entry.is_file ? formatSize(entry.size) : '--'}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {formatDate(entry.modified)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* File loading indicator */}
      {fileLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
          <div className="text-gray-500">Loading file...</div>
        </div>
      )}

      {/* File viewer modal */}
      {selectedFile && (
        <FileViewer file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </div>
  )
}
