import { useState, useEffect } from 'react'
import { orchestrator, GitHubSettings as GitHubSettingsType, TokenValidationResponse } from '../../lib/orchestrator'
import { useProjects } from '../../hooks/useProjects'

export function GitHubSettings() {
  const { selectedProjectId, projects } = useProjects()
  const [settings, setSettings] = useState<GitHubSettingsType | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Form state
  const [token, setToken] = useState('')
  const [tokenValidation, setTokenValidation] = useState<TokenValidationResponse | null>(null)
  const [validatingToken, setValidatingToken] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [autoCreatePr, setAutoCreatePr] = useState(false)
  const [syncIssues, setSyncIssues] = useState(false)

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  useEffect(() => {
    if (selectedProjectId) {
      loadSettings()
    } else {
      setSettings(null)
      resetForm()
    }
  }, [selectedProjectId])

  const loadSettings = async () => {
    if (!selectedProjectId) return

    setLoading(true)
    setError(null)
    try {
      const data = await orchestrator.getGitHubSettings(selectedProjectId)
      setSettings(data)
      // Populate form
      setRepoUrl(data.repo_url || '')
      setDefaultBranch(data.default_branch)
      setAutoCreatePr(data.auto_create_pr)
      setSyncIssues(data.sync_issues)
      // Token is not returned - leave empty
      setToken('')
      setTokenValidation(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setToken('')
    setTokenValidation(null)
    setRepoUrl('')
    setDefaultBranch('main')
    setAutoCreatePr(false)
    setSyncIssues(false)
  }

  const validateToken = async () => {
    if (!token.trim()) {
      setTokenValidation({ valid: false, username: null, scopes: [], error: 'Token is required' })
      return
    }

    setValidatingToken(true)
    setTokenValidation(null)
    try {
      const result = await orchestrator.validateGitHubToken(token)
      setTokenValidation(result)
    } catch (e) {
      setTokenValidation({ valid: false, username: null, scopes: [], error: (e as Error).message })
    } finally {
      setValidatingToken(false)
    }
  }

  const handleSave = async () => {
    if (!selectedProjectId) return

    setSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const updates: Record<string, unknown> = {
        repo_url: repoUrl || null,
        default_branch: defaultBranch,
        auto_create_pr: autoCreatePr,
        sync_issues: syncIssues,
      }
      // Only update token if a new one was entered
      if (token.trim()) {
        updates.token = token
      }

      const data = await orchestrator.updateGitHubSettings(selectedProjectId, updates)
      setSettings(data)
      setSaveSuccess(true)
      setToken('') // Clear token field after save
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!selectedProjectId) {
    return (
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-geoff-text mb-4">GitHub Integration</h2>
        <div className="text-geoff-text-muted text-sm">
          Select a project to configure GitHub integration.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-geoff-text mb-4">GitHub Integration</h2>
        <div className="text-geoff-text-muted">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <h2 className="text-lg font-semibold text-geoff-text mb-4">GitHub Integration</h2>

      {/* Project Info */}
      <div className="mb-4 p-3 bg-geoff-surface rounded-lg border border-geoff-border">
        <span className="text-xs text-geoff-text-dim">Project</span>
        <p className="font-medium text-geoff-text">{selectedProject?.name}</p>
        <p className="text-xs text-geoff-text-muted font-mono">{selectedProject?.path}</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-geoff-error-dim border border-geoff-error/30 rounded-lg">
          <p className="text-sm text-geoff-error">{error}</p>
        </div>
      )}

      {saveSuccess && (
        <div className="mb-4 p-3 bg-geoff-success-dim border border-geoff-success/30 rounded-lg">
          <p className="text-sm text-geoff-success">Settings saved successfully!</p>
        </div>
      )}

      {/* Token Status */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-geoff-text mb-2">GitHub Token</h3>

        {settings?.token_configured ? (
          <div className="mb-3 p-2 bg-geoff-success-dim border border-geoff-success/30 rounded-lg">
            <span className="text-xs text-geoff-success">Token configured</span>
          </div>
        ) : (
          <div className="mb-3 p-2 bg-geoff-warning-dim border border-geoff-warning/30 rounded-lg">
            <span className="text-xs text-geoff-warning">No token configured</span>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value)
              setTokenValidation(null)
            }}
            placeholder="ghp_xxxxxxxxxxxx (Personal Access Token)"
            className="flex-1 px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text placeholder-geoff-text-dim focus:outline-none focus:ring-1 focus:ring-geoff-accent"
          />
          <button
            onClick={validateToken}
            disabled={!token.trim() || validatingToken}
            className="px-3 py-2 text-sm border border-geoff-border text-geoff-text-muted rounded hover:bg-geoff-card transition-colors disabled:opacity-50"
          >
            {validatingToken ? 'Validating...' : 'Validate'}
          </button>
        </div>

        {tokenValidation && (
          <div className={`mt-2 p-2 rounded-lg text-sm ${
            tokenValidation.valid
              ? 'bg-geoff-success-dim border border-geoff-success/30 text-geoff-success'
              : 'bg-geoff-error-dim border border-geoff-error/30 text-geoff-error'
          }`}>
            {tokenValidation.valid ? (
              <>
                <p>Valid token for user: <strong>{tokenValidation.username}</strong></p>
                {tokenValidation.scopes.length > 0 && (
                  <p className="text-xs mt-1">Scopes: {tokenValidation.scopes.join(', ')}</p>
                )}
              </>
            ) : (
              <p>{tokenValidation.error}</p>
            )}
          </div>
        )}

        <p className="text-xs text-geoff-text-dim mt-2">
          Generate a token at{' '}
          <a
            href="https://github.com/settings/tokens/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-geoff-accent hover:underline"
          >
            GitHub Settings
          </a>
          . Requires <code className="px-1 bg-geoff-surface rounded">repo</code> scope.
        </p>
      </div>

      {/* Repository URL */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-geoff-text mb-2">
          Repository URL
        </label>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text placeholder-geoff-text-dim focus:outline-none focus:ring-1 focus:ring-geoff-accent"
        />
        {settings?.owner && settings?.repo && (
          <p className="text-xs text-geoff-text-dim mt-1">
            Owner: {settings.owner} / Repo: {settings.repo}
          </p>
        )}
      </div>

      {/* Default Branch */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-geoff-text mb-2">
          Default Branch
        </label>
        <input
          type="text"
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
          placeholder="main"
          className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text placeholder-geoff-text-dim focus:outline-none focus:ring-1 focus:ring-geoff-accent"
        />
      </div>

      {/* Options */}
      <div className="mb-6 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCreatePr}
            onChange={(e) => setAutoCreatePr(e.target.checked)}
            className="w-4 h-4 rounded border-geoff-border bg-geoff-surface text-geoff-accent focus:ring-geoff-accent"
          />
          <span className="text-sm text-geoff-text">
            Auto-create PR when agent completes a task
          </span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={syncIssues}
            onChange={(e) => setSyncIssues(e.target.checked)}
            className="w-4 h-4 rounded border-geoff-border bg-geoff-surface text-geoff-accent focus:ring-geoff-accent"
          />
          <span className="text-sm text-geoff-text">
            Sync task status with GitHub issues
          </span>
        </label>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-4 py-2 bg-geoff-accent text-white rounded hover:bg-geoff-accent-hover transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
