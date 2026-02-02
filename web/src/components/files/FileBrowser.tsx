import { useState, useEffect, useRef } from 'react'
import { orchestrator, FileEntry, FileContentResponse } from '../../lib/orchestrator'
import { useProjects } from '../../hooks/useProjects'

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
      <svg className="w-5 h-5 text-geoff-warning" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    )
  }

  const ext = entry.extension || ''
  const codeExts = ['.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h']
  const docExts = ['.md', '.txt', '.doc', '.pdf']
  const configExts = ['.json', '.yaml', '.yml', '.toml', '.env', '.xml']

  if (codeExts.includes(ext)) {
    return (
      <svg className="w-5 h-5 text-geoff-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    )
  }

  if (docExts.includes(ext)) {
    return (
      <svg className="w-5 h-5 text-geoff-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }

  if (configExts.includes(ext)) {
    return (
      <svg className="w-5 h-5 text-geoff-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  }

  return (
    <svg className="w-5 h-5 text-geoff-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-geoff-card border border-geoff-border rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-geoff-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-geoff-text">{file.name}</h3>
            <p className="text-xs text-geoff-text-dim">
              {formatSize(file.size)} · {formatDate(file.modified)}
              {file.is_truncated && <span className="text-geoff-warning ml-2">(truncated)</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-geoff-text-dim hover:text-geoff-text transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 bg-geoff-bg">
          <pre className="text-sm text-geoff-text font-mono whitespace-pre-wrap">{file.content}</pre>
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
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  // Create folder state
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [registerAsProject, setRegisterAsProject] = useState(true)
  const [creating, setCreating] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const { fetchProjects } = useProjects()

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
    setTimeout(() => browse(currentPath), 0)
  }

  const copyPath = async () => {
    if (!currentPath) return
    setCopyError(false)

    // Try modern Clipboard API first
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(currentPath)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        return
      } catch (e) {
        console.warn('Clipboard API failed, trying fallback:', e)
      }
    }

    // Fallback for non-secure contexts (HTTP) or older browsers
    try {
      const textArea = document.createElement('textarea')
      textArea.value = currentPath
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      textArea.style.top = '-9999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)

      if (successful) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        throw new Error('execCommand returned false')
      }
    } catch (e) {
      console.error('Failed to copy path:', e)
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2000)
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentPath) return

    setCreating(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await orchestrator.createDirectory(currentPath, newFolderName.trim())

      if (registerAsProject) {
        await orchestrator.createProject(newFolderName.trim(), result.path)
        await fetchProjects()
        setSuccessMessage(`Created project folder "${newFolderName.trim()}"`)
      } else {
        setSuccessMessage(`Created folder "${newFolderName.trim()}"`)
      }

      // Reset form and refresh
      setNewFolderName('')
      setShowCreateFolder(false)
      await browse(currentPath)

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const openCreateFolder = () => {
    setShowCreateFolder(true)
    setError(null)
    setTimeout(() => folderInputRef.current?.focus(), 100)
  }

  return (
    <div className="card flex flex-col h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-geoff-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-geoff-text">File Browser</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={openCreateFolder}
              className="flex items-center gap-1 text-sm text-geoff-success hover:text-geoff-success/80 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Folder
            </button>
            <label className="flex items-center gap-2 text-sm text-geoff-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={toggleHidden}
                className="rounded border-geoff-border bg-geoff-surface"
              />
              Show hidden
            </label>
          </div>
        </div>

        {/* Create folder form */}
        {showCreateFolder && (
          <div className="mb-3 p-3 bg-geoff-surface rounded-lg border border-geoff-border">
            <div className="flex items-center gap-2 mb-2">
              <input
                ref={folderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder()
                  if (e.key === 'Escape') {
                    setShowCreateFolder(false)
                    setNewFolderName('')
                  }
                }}
                placeholder="Folder name..."
                className="input flex-1 text-sm"
              />
              <button
                onClick={handleCreateFolder}
                disabled={creating || !newFolderName.trim()}
                className="btn-primary text-sm whitespace-nowrap"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => {
                  setShowCreateFolder(false)
                  setNewFolderName('')
                }}
                className="p-2 text-geoff-text-dim hover:text-geoff-text transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-geoff-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={registerAsProject}
                onChange={(e) => setRegisterAsProject(e.target.checked)}
                className="rounded border-geoff-border bg-geoff-surface"
              />
              Register as project in Geoff
            </label>
            <p className="mt-1 text-xs text-geoff-text-dim">
              Creating in: <span className="font-mono">{currentPath}</span>
            </p>
          </div>
        )}

        {/* Quick paths */}
        {quickPaths.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {quickPaths.map((qp) => (
              <button
                key={qp.path}
                onClick={() => browse(qp.path)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  currentPath === qp.path
                    ? 'bg-geoff-accent text-white'
                    : 'bg-geoff-surface text-geoff-text-muted hover:bg-geoff-card border border-geoff-border'
                }`}
              >
                {qp.name}
              </button>
            ))}
          </div>
        )}

        {/* Current path */}
        <div className="flex items-center gap-2 bg-geoff-surface rounded-lg px-3 py-2 border border-geoff-border">
          {parentPath && (
            <button
              onClick={() => browse(parentPath)}
              className="p-1 text-geoff-text-muted hover:text-geoff-text hover:bg-geoff-card rounded transition-colors"
              title="Go up"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <span className="text-sm text-geoff-text truncate flex-1 font-mono" title={currentPath}>
            {currentPath}
          </span>
          <button
            onClick={copyPath}
            className={`p-1.5 rounded transition-colors shrink-0 ${
              copied
                ? 'bg-geoff-success-dim text-geoff-success'
                : copyError
                ? 'bg-geoff-error-dim text-geoff-error'
                : 'text-geoff-text-muted hover:text-geoff-text hover:bg-geoff-card'
            }`}
            title={copied ? 'Copied!' : copyError ? 'Failed to copy' : 'Copy path'}
          >
            {copied ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : copyError ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          <span className="text-xs text-geoff-text-dim hidden sm:inline">
            {stats.dirs} folders, {stats.files} files
          </span>
        </div>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="px-4 py-2 bg-geoff-success-dim text-geoff-success text-sm border-b border-geoff-success/30">
          {successMessage}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-geoff-error-dim text-geoff-error text-sm border-b border-geoff-error/30">
          {error}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8 text-geoff-text-muted">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-geoff-text-muted">Empty directory</div>
        ) : (
          <table className="w-full">
            <thead className="bg-geoff-surface sticky top-0">
              <tr className="text-left text-xs text-geoff-text-dim uppercase">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium w-24">Size</th>
                <th className="px-4 py-2 font-medium w-40">Modified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-geoff-border">
              {entries.map((entry) => (
                <tr
                  key={entry.path}
                  onClick={() => handleEntryClick(entry)}
                  className="hover:bg-geoff-surface cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <FileIcon entry={entry} />
                      <span className="text-sm text-geoff-text truncate">{entry.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-geoff-text-dim">
                    {entry.is_file ? formatSize(entry.size) : '--'}
                  </td>
                  <td className="px-4 py-2 text-xs text-geoff-text-dim">
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
        <div className="absolute inset-0 bg-geoff-bg/75 flex items-center justify-center">
          <div className="text-geoff-text-muted">Loading file...</div>
        </div>
      )}

      {/* File viewer modal */}
      {selectedFile && (
        <FileViewer file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </div>
  )
}
