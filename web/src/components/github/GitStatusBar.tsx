import { useState, useEffect } from 'react'
import { orchestrator, GitStatus, BranchListResponse } from '../../lib/orchestrator'

interface GitStatusBarProps {
  projectId: string | null
  onRefresh?: () => void
}

export function GitStatusBar({ projectId, onRefresh }: GitStatusBarProps) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<BranchListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBranches, setShowBranches] = useState(false)
  const [changingBranch, setChangingBranch] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [showNewBranchInput, setShowNewBranchInput] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)

  useEffect(() => {
    if (projectId) {
      loadStatus()
    } else {
      setStatus(null)
      setBranches(null)
    }
  }, [projectId])

  const loadStatus = async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)
    try {
      const [statusData, branchData] = await Promise.all([
        orchestrator.getGitStatus(projectId),
        orchestrator.listBranches(projectId).catch(() => null),
      ])
      setStatus(statusData)
      setBranches(branchData)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleBranchChange = async (branchName: string) => {
    if (!projectId || changingBranch) return

    setChangingBranch(true)
    setShowBranches(false)
    try {
      await orchestrator.checkoutBranch(projectId, branchName)
      await loadStatus()
      onRefresh?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setChangingBranch(false)
    }
  }

  const handleRefresh = () => {
    loadStatus()
    onRefresh?.()
  }

  const handlePush = async () => {
    if (!projectId || pushing) return

    setPushing(true)
    try {
      await orchestrator.push(projectId)
      await loadStatus()
      onRefresh?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPushing(false)
    }
  }

  const handlePull = async () => {
    if (!projectId || pulling) return

    setPulling(true)
    try {
      await orchestrator.pull(projectId)
      await loadStatus()
      onRefresh?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPulling(false)
    }
  }

  const handleCreateBranch = async () => {
    if (!projectId || !newBranchName.trim() || creatingBranch) return

    setCreatingBranch(true)
    try {
      await orchestrator.createBranch(projectId, newBranchName.trim())
      setNewBranchName('')
      setShowNewBranchInput(false)
      setShowBranches(false)
      await loadStatus()
      onRefresh?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreatingBranch(false)
    }
  }

  if (!projectId) {
    return null
  }

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-geoff-surface rounded-lg border border-geoff-border text-sm text-geoff-text-muted">
        <span className="animate-pulse">Loading git status...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-between px-3 py-2 bg-geoff-error-dim rounded-lg border border-geoff-error/30">
        <span className="text-sm text-geoff-error">{error}</span>
        <button
          onClick={loadStatus}
          className="text-xs text-geoff-error hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!status?.is_git_repo) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-geoff-surface rounded-lg border border-geoff-border text-sm text-geoff-text-muted">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Not a Git repository</span>
      </div>
    )
  }

  const totalChanges = status.modified.length + status.untracked.length + status.staged.length

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-geoff-surface rounded-lg border border-geoff-border">
      {/* Branch */}
      <div className="relative">
        <button
          onClick={() => setShowBranches(!showBranches)}
          disabled={changingBranch}
          className="flex items-center gap-1.5 px-2 py-1 text-sm rounded hover:bg-geoff-card transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4 text-geoff-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="font-medium text-geoff-text">{status.branch}</span>
          <svg className="w-3 h-3 text-geoff-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Branch dropdown */}
        {showBranches && branches && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => {
                setShowBranches(false)
                setShowNewBranchInput(false)
                setNewBranchName('')
              }}
            />
            <div className="absolute top-full left-0 mt-1 z-20 w-56 max-h-72 overflow-y-auto bg-geoff-card border border-geoff-border rounded-lg shadow-lg">
              {/* New Branch option */}
              {showNewBranchInput ? (
                <div className="px-3 py-2 border-b border-geoff-border">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateBranch()
                        if (e.key === 'Escape') {
                          setShowNewBranchInput(false)
                          setNewBranchName('')
                        }
                      }}
                      placeholder="Branch name"
                      className="flex-1 px-2 py-1 text-sm bg-geoff-surface border border-geoff-border rounded text-geoff-text placeholder-geoff-text-muted focus:outline-none focus:border-geoff-accent"
                      autoFocus
                      disabled={creatingBranch}
                    />
                    <button
                      onClick={handleCreateBranch}
                      disabled={!newBranchName.trim() || creatingBranch}
                      className="p-1 text-geoff-success hover:bg-geoff-surface rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Create branch"
                    >
                      {creatingBranch ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowNewBranchInput(false)
                        setNewBranchName('')
                      }}
                      className="p-1 text-geoff-text-muted hover:text-geoff-error hover:bg-geoff-surface rounded"
                      title="Cancel"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewBranchInput(true)}
                  className="w-full px-3 py-2 text-left text-sm text-geoff-accent hover:bg-geoff-surface transition-colors border-b border-geoff-border flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>New Branch</span>
                </button>
              )}
              {/* Branch list */}
              {branches.branches.map((branch) => (
                <button
                  key={branch.name}
                  onClick={() => handleBranchChange(branch.name)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-geoff-surface transition-colors ${
                    branch.is_current ? 'text-geoff-accent font-medium' : 'text-geoff-text'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {branch.is_current && (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    )}
                    <span className={branch.is_current ? '' : 'ml-5'}>{branch.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-geoff-border" />

      {/* Ahead/Behind with Push/Pull buttons */}
      {status.has_remote && (status.ahead > 0 || status.behind > 0) && (
        <>
          {status.ahead > 0 && (
            <button
              onClick={handlePush}
              disabled={pushing}
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-geoff-success hover:bg-geoff-success-dim rounded transition-colors disabled:opacity-50"
              title={`Push ${status.ahead} commit${status.ahead > 1 ? 's' : ''}`}
            >
              {pushing ? (
                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              )}
              <span>{status.ahead}</span>
              <span className="text-geoff-text-muted">Push</span>
            </button>
          )}
          {status.behind > 0 && (
            <button
              onClick={handlePull}
              disabled={pulling}
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-geoff-warning hover:bg-geoff-warning-dim rounded transition-colors disabled:opacity-50"
              title={`Pull ${status.behind} commit${status.behind > 1 ? 's' : ''}`}
            >
              {pulling ? (
                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
              <span>{status.behind}</span>
              <span className="text-geoff-text-muted">Pull</span>
            </button>
          )}
          <div className="h-4 w-px bg-geoff-border" />
        </>
      )}

      {/* File status badges */}
      {totalChanges > 0 ? (
        <div className="flex items-center gap-2 text-xs">
          {status.staged.length > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-geoff-success-dim text-geoff-success rounded" title={`Staged: ${status.staged.join(', ')}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {status.staged.length} staged
            </span>
          )}
          {status.modified.length > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-geoff-warning-dim text-geoff-warning rounded" title={`Modified: ${status.modified.join(', ')}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {status.modified.length} modified
            </span>
          )}
          {status.untracked.length > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-geoff-accent-dim text-geoff-accent rounded" title={`Untracked: ${status.untracked.join(', ')}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {status.untracked.length} untracked
            </span>
          )}
        </div>
      ) : (
        <span className="text-xs text-geoff-text-muted">Clean</span>
      )}

      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="ml-auto p-1 text-geoff-text-muted hover:text-geoff-text transition-colors disabled:opacity-50"
        title="Refresh status"
      >
        <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  )
}
