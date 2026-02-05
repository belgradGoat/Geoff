import { useState, useEffect } from 'react'
import { orchestrator, GitBranch } from '../../lib/orchestrator'

interface BranchSelectorProps {
  projectId: string | null
  onBranchChange?: (branch: string) => void
}

export function BranchSelector({ projectId, onBranchChange }: BranchSelectorProps) {
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [changingBranch, setChangingBranch] = useState(false)

  // Create branch form
  const [newBranchName, setNewBranchName] = useState('')
  const [fromBranch, setFromBranch] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (projectId) {
      loadBranches()
    } else {
      setBranches([])
      setCurrentBranch('')
    }
  }, [projectId])

  const loadBranches = async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)
    try {
      const data = await orchestrator.listBranches(projectId)
      setBranches(data.branches)
      setCurrentBranch(data.current_branch)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleBranchSelect = async (branchName: string) => {
    if (!projectId || changingBranch || branchName === currentBranch) return

    setChangingBranch(true)
    setShowDropdown(false)
    setError(null)
    try {
      await orchestrator.checkoutBranch(projectId, branchName)
      setCurrentBranch(branchName)
      onBranchChange?.(branchName)
      await loadBranches()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setChangingBranch(false)
    }
  }

  const handleCreateBranch = async () => {
    if (!projectId || !newBranchName.trim()) return

    setCreating(true)
    setError(null)
    try {
      await orchestrator.createBranch(projectId, newBranchName.trim(), fromBranch || undefined)
      setShowCreateModal(false)
      setNewBranchName('')
      setFromBranch('')
      await loadBranches()
      onBranchChange?.(newBranchName.trim())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  if (!projectId) {
    return null
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-2 bg-geoff-error-dim border border-geoff-error/30 rounded text-xs text-geoff-error">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Branch selector */}
        <div className="relative flex-1">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            disabled={loading || changingBranch}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text hover:border-geoff-accent transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-geoff-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span>{loading ? 'Loading...' : changingBranch ? 'Switching...' : currentBranch || 'Select branch'}</span>
            </div>
            <svg className="w-4 h-4 text-geoff-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown */}
          {showDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowDropdown(false)}
              />
              <div className="absolute top-full left-0 right-0 mt-1 z-20 max-h-60 overflow-y-auto bg-geoff-card border border-geoff-border rounded-lg shadow-lg">
                {branches.map((branch) => (
                  <button
                    key={branch.name}
                    onClick={() => handleBranchSelect(branch.name)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-geoff-surface transition-colors ${
                      branch.is_current ? 'text-geoff-accent font-medium bg-geoff-surface' : 'text-geoff-text'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {branch.is_current && (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                        <span className={branch.is_current ? '' : 'ml-5'}>{branch.name}</span>
                      </div>
                      {branch.last_commit && (
                        <code className="text-xs text-geoff-text-muted">{branch.last_commit}</code>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Create branch button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-2 text-sm bg-geoff-accent text-white rounded hover:bg-geoff-accent-hover transition-colors"
          title="Create new branch"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Create branch modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-geoff-card border border-geoff-border rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-geoff-border">
              <h3 className="font-medium text-geoff-text">Create New Branch</h3>
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
                <label className="block text-sm text-geoff-text-muted mb-1">Branch Name</label>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="feature/my-feature"
                  className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-geoff-text-muted mb-1">From Branch (optional)</label>
                <select
                  value={fromBranch}
                  onChange={(e) => setFromBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text"
                >
                  <option value="">Current branch ({currentBranch})</option>
                  {branches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
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
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || creating}
                className="px-4 py-2 text-sm bg-geoff-accent text-white rounded hover:bg-geoff-accent-hover disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Branch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
