import { useState, useEffect } from 'react'
import { orchestrator, SystemInfoResponse } from '../../lib/orchestrator'

export function RemoteAccess() {
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    loadSystemInfo()
  }, [])

  const loadSystemInfo = async () => {
    setLoading(true)
    setError(null)
    try {
      const info = await orchestrator.getSystemInfo()
      setSystemInfo(info)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (text: string, label: string) => {
    // Try modern Clipboard API first
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(label)
        setTimeout(() => setCopied(null), 2000)
        return
      } catch (e) {
        console.warn('Clipboard API failed, trying fallback:', e)
      }
    }

    // Fallback for non-secure contexts (HTTP) or older browsers
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      textArea.style.top = '-9999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)

      if (successful) {
        setCopied(label)
        setTimeout(() => setCopied(null), 2000)
      }
    } catch (e) {
      console.error('Failed to copy:', e)
    }
  }

  if (loading) {
    return (
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-geoff-text mb-4">Remote Access</h2>
        <div className="text-geoff-text-muted">Loading system info...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-geoff-text mb-4">Remote Access</h2>
        <div className="text-geoff-error">{error}</div>
        <button
          onClick={loadSystemInfo}
          className="mt-2 text-geoff-accent hover:text-geoff-accent-hover text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <h2 className="text-lg font-semibold text-geoff-text mb-4">Remote Access</h2>

      {/* System Info */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between p-3 bg-geoff-surface rounded-lg border border-geoff-border">
          <div>
            <span className="text-xs text-geoff-text-dim">Hostname</span>
            <p className="font-mono text-sm text-geoff-text">{systemInfo?.hostname}</p>
          </div>
          <span className="px-2 py-1 text-xs bg-geoff-accent-dim text-geoff-accent rounded">
            {systemInfo?.platform}
          </span>
        </div>

        {systemInfo?.tailscale_ip ? (
          <div className="p-3 bg-geoff-success-dim border border-geoff-success/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-geoff-success">Tailscale IP (Connected)</span>
                <p className="font-mono text-sm text-geoff-success">{systemInfo.tailscale_ip}</p>
              </div>
              <button
                onClick={() => copyToClipboard(systemInfo.tailscale_ip!, 'ip')}
                className="px-2 py-1 text-xs border border-geoff-success/30 text-geoff-success rounded hover:bg-geoff-success/10 transition-colors"
              >
                {copied === 'ip' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-geoff-warning-dim border border-geoff-warning/30 rounded-lg">
            <span className="text-xs text-geoff-warning">Tailscale Not Detected</span>
            <p className="text-sm text-geoff-warning">Install Tailscale for remote access</p>
          </div>
        )}
      </div>

      {/* Remote URLs */}
      {systemInfo?.tailscale_ip && (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-medium text-geoff-text-muted">Access from other devices:</h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 bg-geoff-surface rounded-lg border border-geoff-border">
              <div>
                <span className="text-xs text-geoff-text-dim">Web UI</span>
                <p className="font-mono text-sm text-geoff-text">http://{systemInfo.tailscale_ip}:4011</p>
              </div>
              <button
                onClick={() => copyToClipboard(`http://${systemInfo.tailscale_ip}:4011`, 'webui')}
                className="px-2 py-1 text-xs border border-geoff-border text-geoff-text-muted rounded hover:bg-geoff-card transition-colors"
              >
                {copied === 'webui' ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="flex items-center justify-between p-2 bg-geoff-surface rounded-lg border border-geoff-border">
              <div>
                <span className="text-xs text-geoff-text-dim">Orchestrator API</span>
                <p className="font-mono text-sm text-geoff-text">{systemInfo.orchestrator_url}</p>
              </div>
              <button
                onClick={() => copyToClipboard(systemInfo.orchestrator_url, 'api')}
                className="px-2 py-1 text-xs border border-geoff-border text-geoff-text-muted rounded hover:bg-geoff-card transition-colors"
              >
                {copied === 'api' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Instructions */}
      <div className="border-t border-geoff-border pt-4">
        <h3 className="text-sm font-medium text-geoff-text-muted mb-3">Setup Instructions</h3>
        <ol className="text-sm text-geoff-text-muted space-y-2 list-decimal list-inside">
          <li>
            Install Tailscale on Mac:
            <code className="ml-2 px-1 py-0.5 bg-geoff-surface border border-geoff-border rounded text-xs text-geoff-text">brew install tailscale</code>
          </li>
          <li>
            Start and authenticate:
            <code className="ml-2 px-1 py-0.5 bg-geoff-surface border border-geoff-border rounded text-xs text-geoff-text">tailscale up</code>
          </li>
          <li>Install Tailscale app on your phone/other devices</li>
          <li>Join the same Tailnet (use same account)</li>
          <li>Access the Web UI using the Tailscale IP above</li>
        </ol>

        <div className="mt-4 p-3 bg-geoff-accent-dim border border-geoff-accent/30 rounded-lg">
          <p className="text-xs text-geoff-accent">
            <strong>Security:</strong> Tailscale creates an encrypted VPN. Only devices on your Tailnet can access these URLs.
            No ports are exposed to the public internet.
          </p>
        </div>
      </div>
    </div>
  )
}
