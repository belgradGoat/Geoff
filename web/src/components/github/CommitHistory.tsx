import { useState, useEffect } from 'react'
import { orchestrator, GitCommit } from '../../lib/orchestrator'

interface CommitHistoryProps {
  projectId: string | null
  branch?: string
}

export function CommitHistory({ projectId, branch }: CommitHistoryProps) {
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (projectId) {
      loadCommits()
    } else {
      setCommits([])
    }
  }, [projectId, branch])

  const loadCommits = async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)
    try {
      const data = await orchestrator.listCommits(projectId, 20, branch)
      setCommits(data.commits)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  if (!projectId) {
    return (
      <div className="text-sm text-geoff-text-muted">
        Select a project to view commits.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-geoff-text">Recent Commits</h3>
        <button
          onClick={loadCommits}
          disabled={loading}
          className="p-1 text-geoff-text-muted hover:text-geoff-text transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="p-2 bg-geoff-error-dim border border-geoff-error/30 rounded text-xs text-geoff-error">
          {error}
        </div>
      )}

      {loading && commits.length === 0 ? (
        <div className="text-sm text-geoff-text-muted animate-pulse">Loading...</div>
      ) : commits.length === 0 ? (
        <div className="text-sm text-geoff-text-muted">No commits found.</div>
      ) : (
        <div className="space-y-2">
          {commits.map((commit) => (
            <div
              key={commit.sha}
              className="relative pl-6 pb-3 border-l-2 border-geoff-border last:border-l-0 last:pb-0"
            >
              {/* Timeline dot */}
              <div className="absolute left-[-5px] top-0 w-2 h-2 rounded-full bg-geoff-accent" />

              <div className="p-2 bg-geoff-surface rounded border border-geoff-border">
                <div className="flex items-start gap-2">
                  <code className="text-xs text-geoff-accent font-mono flex-shrink-0">
                    {commit.short_sha}
                  </code>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-geoff-text break-words">{commit.message}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-geoff-text-muted">
                      <span>{commit.author}</span>
                      <span>•</span>
                      <span>{formatDate(commit.date)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
