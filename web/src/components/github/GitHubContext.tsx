import { useState, useEffect } from 'react'
import { orchestrator, PullRequest, GitHubIssue } from '../../lib/orchestrator'

interface GitHubContextProps {
  projectId: string | null
  taskContext?: {
    github?: {
      linked_issue?: number
      linked_pr?: number
      related_commits?: string[]
      branch?: string
    }
  }
  onCreateIssue?: () => void
  onCreatePR?: () => void
}

export function GitHubContext({ projectId, taskContext, onCreateIssue, onCreatePR }: GitHubContextProps) {
  const [linkedIssue, setLinkedIssue] = useState<GitHubIssue | null>(null)
  const [linkedPR, setLinkedPR] = useState<PullRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const githubContext = taskContext?.github

  useEffect(() => {
    if (projectId && githubContext) {
      loadLinkedItems()
    } else {
      setLinkedIssue(null)
      setLinkedPR(null)
    }
  }, [projectId, githubContext?.linked_issue, githubContext?.linked_pr])

  const loadLinkedItems = async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)

    try {
      // Load linked issue if present
      if (githubContext?.linked_issue) {
        const issues = await orchestrator.listIssues(projectId, 'all', 100)
        const issue = issues.issues.find(i => i.number === githubContext.linked_issue)
        setLinkedIssue(issue || null)
      }

      // Load linked PR if present
      if (githubContext?.linked_pr) {
        const prs = await orchestrator.listPullRequests(projectId, 'all', 100)
        const pr = prs.pull_requests.find(p => p.number === githubContext.linked_pr)
        setLinkedPR(pr || null)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!projectId) {
    return null
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-geoff-text flex items-center gap-2">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
        GitHub Context
      </h3>

      {error && (
        <div className="p-2 bg-geoff-error-dim border border-geoff-error/30 rounded text-xs text-geoff-error">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-xs text-geoff-text-muted animate-pulse">
          Loading linked items...
        </div>
      )}

      {/* Linked Issue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-geoff-text-muted">Linked Issue</span>
          {onCreateIssue && !linkedIssue && (
            <button
              onClick={onCreateIssue}
              className="text-xs text-geoff-accent hover:underline"
            >
              Create Issue
            </button>
          )}
        </div>
        {linkedIssue ? (
          <a
            href={linkedIssue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 bg-geoff-surface rounded border border-geoff-border hover:border-geoff-accent transition-colors"
          >
            <span className={`px-1.5 py-0.5 text-xs rounded ${
              linkedIssue.state === 'open'
                ? 'bg-geoff-success-dim text-geoff-success'
                : 'bg-geoff-accent-dim text-geoff-accent'
            }`}>
              #{linkedIssue.number}
            </span>
            <span className="text-sm text-geoff-text truncate">{linkedIssue.title}</span>
            <svg className="w-3 h-3 ml-auto text-geoff-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : (
          <div className="text-xs text-geoff-text-dim p-2 bg-geoff-surface rounded border border-geoff-border">
            No linked issue
          </div>
        )}
      </div>

      {/* Linked PR */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-geoff-text-muted">Linked Pull Request</span>
          {onCreatePR && !linkedPR && (
            <button
              onClick={onCreatePR}
              className="text-xs text-geoff-accent hover:underline"
            >
              Create PR
            </button>
          )}
        </div>
        {linkedPR ? (
          <a
            href={linkedPR.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 bg-geoff-surface rounded border border-geoff-border hover:border-geoff-accent transition-colors"
          >
            <span className={`px-1.5 py-0.5 text-xs rounded ${
              linkedPR.state === 'open'
                ? 'bg-geoff-success-dim text-geoff-success'
                : linkedPR.state === 'merged'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-geoff-error-dim text-geoff-error'
            }`}>
              #{linkedPR.number}
            </span>
            <span className="text-sm text-geoff-text truncate">{linkedPR.title}</span>
            <svg className="w-3 h-3 ml-auto text-geoff-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : (
          <div className="text-xs text-geoff-text-dim p-2 bg-geoff-surface rounded border border-geoff-border">
            No linked pull request
          </div>
        )}
      </div>

      {/* Related Commits */}
      {githubContext?.related_commits && githubContext.related_commits.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-geoff-text-muted">Related Commits</span>
          <div className="space-y-1">
            {githubContext.related_commits.map((sha) => (
              <div key={sha} className="flex items-center gap-2 p-1.5 bg-geoff-surface rounded border border-geoff-border">
                <code className="text-xs text-geoff-accent font-mono">{sha.slice(0, 7)}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Branch */}
      {githubContext?.branch && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-geoff-text-muted">Branch:</span>
          <code className="px-1.5 py-0.5 bg-geoff-surface rounded border border-geoff-border text-geoff-text font-mono">
            {githubContext.branch}
          </code>
        </div>
      )}
    </div>
  )
}
