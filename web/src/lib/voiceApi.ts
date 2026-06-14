const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL || `${window.location.protocol}//${window.location.hostname}:8080`
const apiKey = import.meta.env.VITE_ORCHESTRATOR_API_KEY || ''

export interface TranscriptionResult {
  text: string
}

export interface VoiceStatus {
  stt_enabled: boolean
  tts_enabled: boolean
  stt_ready: boolean
  tts_ready: boolean
  stt_loading: boolean
  tts_loading: boolean
  stt_model: string
  tts_model: string
  tts_voice: string
  tts_speed: number
}

export const voiceApi = {
  async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
    const formData = new FormData()
    formData.append('audio', audioBlob, 'recording.webm')

    const response = await fetch(`${orchestratorUrl}/api/voice/transcribe`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  },

  async synthesize(text: string, voice?: string): Promise<Blob> {
    const response = await fetch(`${orchestratorUrl}/api/voice/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ text, voice }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.blob()
  },

  async getStatus(): Promise<VoiceStatus> {
    const response = await fetch(`${orchestratorUrl}/api/voice/status`, {
      headers: {
        'X-API-Key': apiKey,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  },

  async warmup(): Promise<Record<string, string>> {
    const response = await fetch(`${orchestratorUrl}/api/voice/warmup`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  },
}
