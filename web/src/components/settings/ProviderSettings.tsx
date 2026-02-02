import { useState, useEffect } from 'react'
import { orchestrator, ProviderInfo } from '../../lib/orchestrator'

export function ProviderSettings() {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [defaultProvider, setDefaultProvider] = useState<string>('claude')
  const [selectedProvider, setSelectedProvider] = useState<string>('claude')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadProviders()
    // Load saved preference from localStorage
    const savedProvider = localStorage.getItem('geoff-provider')
    if (savedProvider) {
      setSelectedProvider(savedProvider)
    }
  }, [])

  const loadProviders = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await orchestrator.listProviders()
      setProviders(response.providers)
      setDefaultProvider(response.default)
      // If no saved preference, use server default
      const savedProvider = localStorage.getItem('geoff-provider')
      if (!savedProvider) {
        setSelectedProvider(response.default)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId)
    localStorage.setItem('geoff-provider', providerId)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-geoff-text mb-4">AI Provider</h2>
        <div className="text-geoff-text-muted">Loading providers...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-geoff-text mb-4">AI Provider</h2>
        <div className="text-geoff-error">{error}</div>
        <button
          onClick={loadProviders}
          className="mt-2 text-geoff-accent hover:text-geoff-accent-hover text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-geoff-text">AI Provider</h2>
        {saved && (
          <span className="text-xs text-geoff-success">Saved!</span>
        )}
      </div>

      <p className="text-sm text-geoff-text-muted mb-4">
        Select which AI coding CLI to use when launching agents.
      </p>

      <div className="space-y-3">
        {providers.map((provider) => (
          <label
            key={provider.id}
            className={`block p-4 rounded-lg border cursor-pointer transition-all ${
              selectedProvider === provider.id
                ? 'border-geoff-accent bg-geoff-accent-dim'
                : 'border-geoff-border bg-geoff-surface hover:border-geoff-border-light'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="provider"
                value={provider.id}
                checked={selectedProvider === provider.id}
                onChange={() => handleProviderChange(provider.id)}
                className="mt-1 accent-geoff-accent"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-geoff-text">{provider.name}</span>
                  {provider.has_free_tier && (
                    <span className="px-1.5 py-0.5 text-xs bg-geoff-success-dim text-geoff-success rounded">
                      Free Tier
                    </span>
                  )}
                  {provider.id === defaultProvider && (
                    <span className="px-1.5 py-0.5 text-xs bg-geoff-accent-dim text-geoff-accent rounded">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-geoff-text-muted mt-1">{provider.description}</p>
                <a
                  href={provider.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-geoff-accent hover:underline mt-1 inline-block"
                  onClick={(e) => e.stopPropagation()}
                >
                  Learn more
                </a>
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* MCP Setup Notice */}
      <div className="mt-4 p-3 bg-geoff-warning-dim border border-geoff-warning/30 rounded-lg">
        <p className="text-xs text-geoff-warning">
          <strong>Note:</strong> Each provider requires its own CLI installation and MCP server configuration.
          See the User Guide for setup instructions.
        </p>
      </div>
    </div>
  )
}
