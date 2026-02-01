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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Remote Access</h2>
        <div className="text-gray-500">Loading system info...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Remote Access</h2>
        <div className="text-red-500">{error}</div>
        <button
          onClick={loadSystemInfo}
          className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Remote Access</h2>

      {/* System Info */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <span className="text-xs text-gray-500">Hostname</span>
            <p className="font-mono text-sm">{systemInfo?.hostname}</p>
          </div>
          <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
            {systemInfo?.platform}
          </span>
        </div>

        {systemInfo?.tailscale_ip ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-green-600">Tailscale IP (Connected)</span>
                <p className="font-mono text-sm text-green-800">{systemInfo.tailscale_ip}</p>
              </div>
              <button
                onClick={() => copyToClipboard(systemInfo.tailscale_ip!, 'ip')}
                className="px-2 py-1 text-xs border border-green-300 text-green-700 rounded hover:bg-green-100"
              >
                {copied === 'ip' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <span className="text-xs text-yellow-600">Tailscale Not Detected</span>
            <p className="text-sm text-yellow-800">Install Tailscale for remote access</p>
          </div>
        )}
      </div>

      {/* Remote URLs */}
      {systemInfo?.tailscale_ip && (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-medium text-gray-700">Access from other devices:</h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div>
                <span className="text-xs text-gray-500">Web UI</span>
                <p className="font-mono text-sm">http://{systemInfo.tailscale_ip}:4011</p>
              </div>
              <button
                onClick={() => copyToClipboard(`http://${systemInfo.tailscale_ip}:4011`, 'webui')}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
              >
                {copied === 'webui' ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div>
                <span className="text-xs text-gray-500">Orchestrator API</span>
                <p className="font-mono text-sm">{systemInfo.orchestrator_url}</p>
              </div>
              <button
                onClick={() => copyToClipboard(systemInfo.orchestrator_url, 'api')}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
              >
                {copied === 'api' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Instructions */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Setup Instructions</h3>
        <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
          <li>
            Install Tailscale on Mac:
            <code className="ml-2 px-1 py-0.5 bg-gray-100 rounded text-xs">brew install tailscale</code>
          </li>
          <li>
            Start and authenticate:
            <code className="ml-2 px-1 py-0.5 bg-gray-100 rounded text-xs">tailscale up</code>
          </li>
          <li>Install Tailscale app on your phone/other devices</li>
          <li>Join the same Tailnet (use same account)</li>
          <li>Access the Web UI using the Tailscale IP above</li>
        </ol>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700">
            <strong>Security:</strong> Tailscale creates an encrypted VPN. Only devices on your Tailnet can access these URLs.
            No ports are exposed to the public internet.
          </p>
        </div>
      </div>
    </div>
  )
}
