import { useState, useEffect } from 'react'
import { orchestrator, PullRequest, CreatePullRequestRequest } from '../../lib/orchestrator'
import { PRDetailModal } from './PRDetailModal'

interface PullRequestListProps {
  projectId: string | null
}

export function PullRequestList({ projectId }: PullRequestListProps) {
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selectedPR, setSelectedPR] = useState<number | null>(null)

  // Create PR form
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')

  useEffect(() => {
    if (projectId) {
      loadPullRequests()
    } else {
      setPullRequests([])
    }
  }, [projectId, filter])

  const loadPullRequests = async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)
    try {
      const data = await orchestrator.listPullRequests(projectId, filter, 50)
      setPullRequests(data.pull_requests)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePR = async () => {
    if (!projectId || !title.trim()) return

    setCreating(true)
    setError(null)
    try {
      const request: CreatePullRequestRequest = {
        title: title.trim(),
        body: body.trim() || undefined,
        base_branch: baseBranch || undefined,
      }
      await orchestrator.createPullRequest(projectId, request)
      setShowCreateModal(false)
      setTitle('')
      setBody('')
      setBaseBranch('main')
      loadPullRequests()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  if (!projectId) {
    return (
      <div className="text-sm text-geoff-text-muted">
        Select a project to view pull requests.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-geoff-text">Pull Requests</h3>
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
            New PR
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
      ) : pullRequests.length === 0 ? (
        <div className="text-sm text-geoff-text-muted">No pull requests found.</div>
      ) : (
        <div className="space-y-2">
          {pullRequests.map((pr) => (
            <button
              key={pr.number}
              onClick={() => setSelectedPR(pr.number)}
              className="block w-full text-left p-3 bg-geoff-surface rounded-lg border border-geoff-border hover:border-geoff-accent transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  pr.state === 'open'
                    ? 'bg-geoff-success-dim text-geoff-success'
                    : pr.state === 'merged'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-geoff-error-dim text-geoff-error'
                }`}>
                  {pr.state}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-geoff-text-muted">#{pr.number}</span>
                    <span className="font-medium text-geoff-text truncate">{pr.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-geoff-text-muted">
                    <span>{pr.author}</span>
                    <span>•</span>
                    <span>{pr.head_branch} → {pr.base_branch}</span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-geoff-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* PR Detail Modal */}
      {selectedPR && projectId && (
        <PRDetailModal
          projectId={projectId}
          prNumber={selectedPR}
          onClose={() => setSelectedPR(null)}
          onPRUpdated={() => {
            loadPullRequests()
            setSelectedPR(null)
          }}
        />
      )}

      {/* Create PR Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-geoff-card border border-geoff-border rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-geoff-border">
              <h3 className="font-medium text-geoff-text">Create Pull Request</h3>
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
                  placeholder="PR title"
                  className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text"
                />
              </div>
              <div>
                <label className="block text-sm text-geoff-text-muted mb-1">Description</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="PR description (optional)"
                  rows={4}
                  className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-geoff-text-muted mb-1">Base Branch</label>
                <input
                  type="text"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  placeholder="main"
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
                onClick={handleCreatePR}
                disabled={!title.trim() || creating}
                className="px-4 py-2 text-sm bg-geoff-accent text-white rounded hover:bg-geoff-accent-hover disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create PR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
