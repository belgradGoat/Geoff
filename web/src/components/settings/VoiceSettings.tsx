import { useState } from 'react'
import { useVoice } from '../../hooks/useVoice'
import { voiceApi, VoiceStatus } from '../../lib/voiceApi'

export function VoiceSettings() {
  const {
    sttEnabled,
    ttsEnabled,
    voiceInputMode,
    autoPlayTTS,
    selectedVoice,
    setSttEnabled,
    setTtsEnabled,
    setVoiceInputMode,
    setAutoPlayTTS,
    setSelectedVoice,
  } = useVoice()

  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [warming, setWarming] = useState(false)
  const [testPlaying, setTestPlaying] = useState(false)

  const loadStatus = async () => {
    setLoading(true)
    try {
      const s = await voiceApi.getStatus()
      setStatus(s)
    } catch (e) {
      console.error('Failed to load voice status:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleWarmup = async () => {
    setWarming(true)
    try {
      await voiceApi.warmup()
      await loadStatus()
    } catch (e) {
      console.error('Warmup failed:', e)
    } finally {
      setWarming(false)
    }
  }

  const handleTestVoice = async () => {
    setTestPlaying(true)
    try {
      const audioBlob = await voiceApi.synthesize('Hello! This is a voice test.', selectedVoice)
      const url = URL.createObjectURL(audioBlob)
      const audio = new Audio(url)
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setTestPlaying(false)
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setTestPlaying(false)
      }
      await audio.play()
    } catch (e) {
      console.error('Test voice failed:', e)
      setTestPlaying(false)
    }
  }

  const voicePresets = [
    'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica',
    'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
    'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx',
  ]

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-geoff-text">Voice</h2>
        <button
          onClick={loadStatus}
          disabled={loading}
          className="text-xs text-geoff-accent hover:text-geoff-accent-hover transition-colors"
        >
          {loading ? 'Checking...' : 'Check Status'}
        </button>
      </div>

      <div className="space-y-4">
        {/* STT Toggle */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-geoff-text">Speech-to-Text</span>
            <p className="text-xs text-geoff-text-muted">Speak to the agent via microphone</p>
          </div>
          <input
            type="checkbox"
            checked={sttEnabled}
            onChange={(e) => setSttEnabled(e.target.checked)}
            className="accent-geoff-accent w-4 h-4"
          />
        </label>

        {/* TTS Toggle */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-geoff-text">Text-to-Speech</span>
            <p className="text-xs text-geoff-text-muted">Hear agent responses read aloud</p>
          </div>
          <input
            type="checkbox"
            checked={ttsEnabled}
            onChange={(e) => setTtsEnabled(e.target.checked)}
            className="accent-geoff-accent w-4 h-4"
          />
        </label>

        {/* Input Mode */}
        {sttEnabled && (
          <div>
            <span className="text-sm font-medium text-geoff-text block mb-2">Input Mode</span>
            <div className="flex gap-2">
              <button
                onClick={() => setVoiceInputMode('push-to-talk')}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-all ${
                  voiceInputMode === 'push-to-talk'
                    ? 'border-geoff-accent bg-geoff-accent-dim text-geoff-accent'
                    : 'border-geoff-border bg-geoff-surface text-geoff-text-muted hover:border-geoff-border-light'
                }`}
              >
                Push-to-Talk
              </button>
              <button
                onClick={() => setVoiceInputMode('toggle')}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-all ${
                  voiceInputMode === 'toggle'
                    ? 'border-geoff-accent bg-geoff-accent-dim text-geoff-accent'
                    : 'border-geoff-border bg-geoff-surface text-geoff-text-muted hover:border-geoff-border-light'
                }`}
              >
                Toggle
              </button>
            </div>
          </div>
        )}

        {/* Auto-play TTS */}
        {ttsEnabled && (
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-medium text-geoff-text">Auto-play Responses</span>
              <p className="text-xs text-geoff-text-muted">Automatically speak agent responses</p>
            </div>
            <input
              type="checkbox"
              checked={autoPlayTTS}
              onChange={(e) => setAutoPlayTTS(e.target.checked)}
              className="accent-geoff-accent w-4 h-4"
            />
          </label>
        )}

        {/* Voice Selection */}
        {ttsEnabled && (
          <div>
            <span className="text-sm font-medium text-geoff-text block mb-2">Voice</span>
            <div className="flex gap-2">
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="input flex-1 text-sm"
              >
                {voicePresets.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <button
                onClick={handleTestVoice}
                disabled={testPlaying}
                className="btn-secondary text-xs px-3"
              >
                {testPlaying ? 'Playing...' : 'Test'}
              </button>
            </div>
          </div>
        )}

        {/* Status & Warmup */}
        {status && (
          <div className="p-3 bg-geoff-surface rounded-lg border border-geoff-border">
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-geoff-text-muted">STT Model</span>
                <span className={status.stt_ready ? 'text-geoff-success' : 'text-geoff-text-dim'}>
                  {status.stt_ready ? 'Loaded' : status.stt_loading ? 'Loading...' : 'Not loaded'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-geoff-text-muted">TTS Model</span>
                <span className={status.tts_ready ? 'text-geoff-success' : 'text-geoff-text-dim'}>
                  {status.tts_ready ? 'Loaded' : status.tts_loading ? 'Loading...' : 'Not loaded'}
                </span>
              </div>
            </div>
            {(!status.stt_ready || !status.tts_ready) && (
              <button
                onClick={handleWarmup}
                disabled={warming}
                className="mt-2 w-full btn-primary text-xs py-1.5"
              >
                {warming ? 'Loading Models...' : 'Pre-load Models'}
              </button>
            )}
          </div>
        )}

        {/* Info */}
        <div className="p-3 bg-geoff-surface/50 border border-geoff-border rounded-lg">
          <p className="text-xs text-geoff-text-muted">
            Voice runs locally via MLX on Apple Silicon. Models download automatically on first use.
            {sttEnabled && voiceInputMode === 'push-to-talk' && (
              <> Hold <kbd className="px-1 py-0.5 bg-geoff-surface border border-geoff-border rounded text-[10px]">Space</kbd> for push-to-talk.</>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
