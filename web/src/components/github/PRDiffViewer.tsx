import { useState } from 'react'
import { PRChangedFile } from '../../lib/orchestrator'

interface PRDiffViewerProps {
  files: PRChangedFile[]
}

export function PRDiffViewer({ files }: PRDiffViewerProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const toggleFile = (filename: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(filename)) {
        next.delete(filename)
      } else {
        next.add(filename)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedFiles(new Set(files.map(f => f.filename)))
  }

  const collapseAll = () => {
    setExpandedFiles(new Set())
  }

  if (files.length === 0) {
    return <div className="text-sm text-geoff-text-muted">No files changed.</div>
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'added': return <span className="text-geoff-success font-bold">A</span>
      case 'deleted': return <span className="text-geoff-error font-bold">D</span>
      case 'renamed': return <span className="text-purple-400 font-bold">R</span>
      default: return <span className="text-yellow-400 font-bold">M</span>
    }
  }

  return (
    <div className="space-y-2">
      {/* File summary header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-geoff-text-muted">
          {files.length} file{files.length !== 1 ? 's' : ''} changed
        </div>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-geoff-accent hover:text-geoff-accent-hover"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="text-xs text-geoff-text-muted hover:text-geoff-text"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* File list */}
      {files.map(file => (
        <div key={file.filename} className="border border-geoff-border rounded-lg overflow-hidden">
          {/* File header */}
          <button
            onClick={() => toggleFile(file.filename)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-geoff-surface hover:bg-geoff-surface/80 transition-colors text-left"
          >
            <svg
              className={`w-3 h-3 text-geoff-text-muted transition-transform ${
                expandedFiles.has(file.filename) ? 'rotate-90' : ''
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6 6L14 10L6 14V6Z" />
            </svg>
            <span className="text-xs w-4 text-center">{statusIcon(file.status)}</span>
            <span className="text-sm text-geoff-text font-mono truncate flex-1">{file.filename}</span>
            <span className="text-xs text-geoff-success">+{file.additions}</span>
            <span className="text-xs text-geoff-error">-{file.deletions}</span>
          </button>

          {/* Diff content */}
          {expandedFiles.has(file.filename) && (
            <div className="overflow-x-auto">
              <pre className="text-xs font-mono leading-5">
                {file.patch.split('\n').map((line, i) => {
                  let bgClass = ''
                  let textClass = 'text-geoff-text'

                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    bgClass = 'bg-green-500/10'
                    textClass = 'text-green-400'
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    bgClass = 'bg-red-500/10'
                    textClass = 'text-red-400'
                  } else if (line.startsWith('@@')) {
                    bgClass = 'bg-blue-500/10'
                    textClass = 'text-blue-400'
                  } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
                    textClass = 'text-geoff-text-muted'
                  }

                  return (
                    <div key={i} className={`px-3 ${bgClass}`}>
                      <span className={textClass}>{line}</span>
                    </div>
                  )
                })}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
