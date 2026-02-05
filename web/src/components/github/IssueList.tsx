import { useState, useEffect } from 'react'
import { orchestrator, GitHubIssue, CreateIssueRequest } from '../../lib/orchestrator'

interface IssueListProps {
  projectId: string | null
}

export function IssueList({ projectId }: IssueListProps) {
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)

  // Create issue form
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [labels, setLabels] = useState('')

  useEffect(() => {
    if (projectId) {
      loadIssues()
    } else {
      setIssues([])
    }
  }, [projectId, filter])

  const loadIssues = async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)
    try {
      const data = await orchestrator.listIssues(projectId, filter, 50)
      setIssues(data.issues)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateIssue = async () => {
    if (!projectId || !title.trim()) return

    setCreating(true)
    setError(null)
    try {
      const request: CreateIssueRequest = {
        title: title.trim(),
        body: body.trim() || undefined,
        labels: labels.split(',').map(l => l.trim()).filter(Boolean),
      }
      await orchestrator.createIssue(projectId, request)
      setShowCreateModal(false)
      setTitle('')
      setBody('')
      setLabels('')
      loadIssues()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  if (!projectId) {
    return (
      <div className="text-sm text-geoff-text-muted">
        Select a project to view issues.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-geoff-text">Issues</h3>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="px-2 py-1 text-xs bg-geoff-surface border border-geoff-border rounded text-geoff-text"
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-2 py-1 text-xs bg-geoff-accent text-white rounded hover:bg-geoff-accent-hover transition-colors"
          >
            New Issue
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-geoff-error-dim border border-geoff-error/30 rounded text-xs text-geoff-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-geoff-text-muted animate-pulse">Loading...</div>
      ) : issues.length === 0 ? (
        <div className="text-sm text-geoff-text-muted">No issues found.</div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <a
              key={issue.number}
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-geoff-surface rounded-lg border border-geoff-border hover:border-geoff-accent transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  issue.state === 'open'
                    ? 'bg-geoff-success-dim text-geoff-success'
                    : 'bg-geoff-accent-dim text-geoff-accent'
                }`}>
                  {issue.state}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-geoff-text-muted">#{issue.number}</span>
                    <span className="font-medium text-geoff-text truncate">{issue.title}</span>
                  </div>
                  {issue.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {issue.labels.map((label) => (
                        <span
                          key={label}
                          className="px-1.5 py-0.5 text-xs bg-geoff-accent-dim text-geoff-accent rounded"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <svg className="w-4 h-4 text-geoff-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Create Issue Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-geoff-card border border-geoff-border rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-geoff-border">
              <h3 className="font-medium text-geoff-text">Create Issue</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-geoff-text-muted hover:text-geoff-text"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-geoff-text-muted mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Issue title"
                  className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text"
                />
              </div>
              <div>
                <label className="block text-sm text-geoff-text-muted mb-1">Description</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Issue description (optional)"
                  rows={4}
                  className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-geoff-text-muted mb-1">Labels (comma-separated)</label>
                <input
                  type="text"
                  value={labels}
                  onChange={(e) => setLabels(e.target.value)}
                  placeholder="bug, enhancement"
                  className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-geoff-border">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-geoff-text-muted hover:text-geoff-text"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateIssue}
                disabled={!title.trim() || creating}
                className="px-4 py-2 text-sm bg-geoff-accent text-white rounded hover:bg-geoff-accent-hover disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Issue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
