import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { voiceApi } from '../lib/voiceApi'

type VoiceInputMode = 'push-to-talk' | 'toggle'

interface VoiceState {
  // Persisted settings
  sttEnabled: boolean
  ttsEnabled: boolean
  voiceInputMode: VoiceInputMode
  autoPlayTTS: boolean
  selectedVoice: string

  // Runtime state (not persisted)
  isRecording: boolean
  isTranscribing: boolean
  isSpeaking: boolean
  audioLevel: number
  error: string | null

  // Internal refs (not persisted)
  _mediaRecorder: MediaRecorder | null
  _audioChunks: Blob[]
  _audioContext: AudioContext | null
  _analyser: AnalyserNode | null
  _animFrameId: number | null
  _currentAudio: HTMLAudioElement | null
  _mediaStream: MediaStream | null

  // Actions
  startRecording: () => Promise<void>
  stopRecording: () => Promise<string | null>
  cancelRecording: () => void
  speakText: (text: string) => Promise<void>
  stopSpeaking: () => void
  setSttEnabled: (enabled: boolean) => void
  setTtsEnabled: (enabled: boolean) => void
  setVoiceInputMode: (mode: VoiceInputMode) => void
  setAutoPlayTTS: (enabled: boolean) => void
  setSelectedVoice: (voice: string) => void
  clearError: () => void
}

export const useVoice = create<VoiceState>()(
  persist(
    (set, get) => ({
      // Persisted settings
      sttEnabled: true,
      ttsEnabled: true,
      voiceInputMode: 'push-to-talk' as VoiceInputMode,
      autoPlayTTS: false,
      selectedVoice: 'af_heart',

      // Runtime state
      isRecording: false,
      isTranscribing: false,
      isSpeaking: false,
      audioLevel: 0,
      error: null,

      // Internal refs
      _mediaRecorder: null,
      _audioChunks: [],
      _audioContext: null,
      _analyser: null,
      _animFrameId: null,
      _currentAudio: null,
      _mediaStream: null,

      startRecording: async () => {
        const state = get()
        if (state.isRecording) return

        set({ error: null })

        if (!navigator.mediaDevices?.getUserMedia) {
          set({ error: window.isSecureContext
            ? 'Microphone not supported in this browser'
            : 'Microphone requires HTTPS (not available over HTTP)'
          })
          return
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

          // Set up audio level monitoring
          const audioContext = new AudioContext()
          const source = audioContext.createMediaStreamSource(stream)
          const analyser = audioContext.createAnalyser()
          analyser.fftSize = 256
          source.connect(analyser)

          // Determine best supported mime type
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : ''

          const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
          const chunks: Blob[] = []

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunks.push(e.data)
            }
          }

          recorder.start(100) // Collect data every 100ms

          // Start audio level animation
          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          const updateLevel = () => {
            analyser.getByteFrequencyData(dataArray)
            const avg = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length
            set({ audioLevel: avg / 255 })
            const frameId = requestAnimationFrame(updateLevel)
            set({ _animFrameId: frameId })
          }
          updateLevel()

          set({
            isRecording: true,
            _mediaRecorder: recorder,
            _audioChunks: chunks,
            _audioContext: audioContext,
            _analyser: analyser,
            _mediaStream: stream,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Microphone access denied'
          set({ error: message })
          console.error('[VOICE] Failed to start recording:', err)
        }
      },

      stopRecording: async () => {
        const state = get()
        if (!state.isRecording || !state._mediaRecorder) return null

        // Stop audio level animation
        if (state._animFrameId) {
          cancelAnimationFrame(state._animFrameId)
        }
        if (state._audioContext) {
          state._audioContext.close()
        }

        // Stop media stream tracks
        if (state._mediaStream) {
          state._mediaStream.getTracks().forEach(track => track.stop())
        }

        return new Promise<string | null>((resolve) => {
          const recorder = state._mediaRecorder!
          const chunks = state._audioChunks

          recorder.onstop = async () => {
            set({
              isRecording: false,
              isTranscribing: true,
              audioLevel: 0,
              _mediaRecorder: null,
              _audioChunks: [],
              _audioContext: null,
              _analyser: null,
              _animFrameId: null,
              _mediaStream: null,
            })

            try {
              const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
              const result = await voiceApi.transcribe(audioBlob)
              set({ isTranscribing: false })
              resolve(result.text)
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Transcription failed'
              set({ isTranscribing: false, error: message })
              console.error('[VOICE] Transcription failed:', err)
              resolve(null)
            }
          }

          recorder.stop()
        })
      },

      cancelRecording: () => {
        const state = get()
        if (!state.isRecording) return

        if (state._animFrameId) {
          cancelAnimationFrame(state._animFrameId)
        }
        if (state._audioContext) {
          state._audioContext.close()
        }
        if (state._mediaStream) {
          state._mediaStream.getTracks().forEach(track => track.stop())
        }
        if (state._mediaRecorder && state._mediaRecorder.state !== 'inactive') {
          state._mediaRecorder.stop()
        }

        set({
          isRecording: false,
          audioLevel: 0,
          _mediaRecorder: null,
          _audioChunks: [],
          _audioContext: null,
          _analyser: null,
          _animFrameId: null,
          _mediaStream: null,
        })
      },

      speakText: async (text: string) => {
        const state = get()
        // Stop any current playback
        if (state._currentAudio) {
          state._currentAudio.pause()
          state._currentAudio = null
        }

        // Use AudioContext for mobile compatibility.
        // resume() must be called synchronously during user gesture
        // to permanently unlock audio playback on mobile browsers.
        const playbackCtx = new AudioContext()
        await playbackCtx.resume()

        set({ isSpeaking: true, error: null })

        try {
          const audioBlob = await voiceApi.synthesize(text, state.selectedVoice)
          const arrayBuffer = await audioBlob.arrayBuffer()
          const audioBuffer = await playbackCtx.decodeAudioData(arrayBuffer)

          const source = playbackCtx.createBufferSource()
          source.buffer = audioBuffer
          source.connect(playbackCtx.destination)

          source.onended = () => {
            playbackCtx.close()
            set({ isSpeaking: false, _currentAudio: null })
          }

          // Store a dummy Audio ref so stopSpeaking can work
          const dummyAudio = new Audio()
          dummyAudio.pause = () => {
            source.stop()
            playbackCtx.close()
          }
          set({ _currentAudio: dummyAudio })

          source.start(0)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Speech synthesis failed'
          playbackCtx.close()
          set({ isSpeaking: false, _currentAudio: null, error: message })
          console.error('[VOICE] TTS failed:', err)
        }
      },

      stopSpeaking: () => {
        const state = get()
        if (state._currentAudio) {
          state._currentAudio.pause()
          set({ isSpeaking: false, _currentAudio: null })
        }
      },

      setSttEnabled: (enabled) => set({ sttEnabled: enabled }),
      setTtsEnabled: (enabled) => set({ ttsEnabled: enabled }),
      setVoiceInputMode: (mode) => set({ voiceInputMode: mode }),
      setAutoPlayTTS: (enabled) => set({ autoPlayTTS: enabled }),
      setSelectedVoice: (voice) => set({ selectedVoice: voice }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'geoff-voice-settings',
      partialize: (state) => ({
        sttEnabled: state.sttEnabled,
        ttsEnabled: state.ttsEnabled,
        voiceInputMode: state.voiceInputMode,
        autoPlayTTS: state.autoPlayTTS,
        selectedVoice: state.selectedVoice,
      }),
    }
  )
)
