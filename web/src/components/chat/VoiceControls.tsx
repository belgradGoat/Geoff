import { useEffect, useCallback, useRef } from 'react'
import { useVoice } from '../../hooks/useVoice'
import { AudioLevelIndicator } from './AudioLevelIndicator'

interface VoiceControlsProps {
  onTranscription: (text: string) => void
  disabled?: boolean
}

export function VoiceControls({ onTranscription, disabled }: VoiceControlsProps) {
  const {
    sttEnabled,
    voiceInputMode,
    isRecording,
    isTranscribing,
    audioLevel,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  } = useVoice()

  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleStop = useCallback(async () => {
    const text = await stopRecording()
    if (text) {
      onTranscription(text)
    }
  }, [stopRecording, onTranscription])

  const handleClick = useCallback(() => {
    if (voiceInputMode === 'toggle') {
      if (isRecording) {
        handleStop()
      } else {
        startRecording()
      }
    }
    // push-to-talk uses mousedown/mouseup instead
  }, [voiceInputMode, isRecording, handleStop, startRecording])

  const handleMouseDown = useCallback(() => {
    if (voiceInputMode === 'push-to-talk' && !isRecording) {
      startRecording()
    }
  }, [voiceInputMode, isRecording, startRecording])

  const handleMouseUp = useCallback(() => {
    if (voiceInputMode === 'push-to-talk' && isRecording) {
      handleStop()
    }
  }, [voiceInputMode, isRecording, handleStop])

  // Keyboard shortcut: Space for push-to-talk (when no input is focused)
  useEffect(() => {
    if (disabled || !sttEnabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        voiceInputMode === 'push-to-talk' &&
        !isRecording &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault()
        startRecording()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        voiceInputMode === 'push-to-talk' &&
        isRecording
      ) {
        e.preventDefault()
        handleStop()
      }
    }

    // Escape to cancel
    const handleEscape = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && isRecording) {
        cancelRecording()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [disabled, sttEnabled, voiceInputMode, isRecording, startRecording, handleStop, cancelRecording])

  // Auto-clear errors
  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

  const micAvailable = !!navigator.mediaDevices?.getUserMedia

  if (!sttEnabled) return null

  return (
    <div className="flex items-center gap-2">
      {/* Recording indicator */}
      {isRecording && <AudioLevelIndicator level={audioLevel} />}

      {/* Transcribing spinner */}
      {isTranscribing && (
        <div className="flex items-center gap-1 text-xs text-geoff-text-muted">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Transcribing...</span>
        </div>
      )}

      {/* Mic button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseDown={voiceInputMode === 'push-to-talk' ? handleMouseDown : undefined}
        onMouseUp={voiceInputMode === 'push-to-talk' ? handleMouseUp : undefined}
        onMouseLeave={voiceInputMode === 'push-to-talk' && isRecording ? handleStop : undefined}
        disabled={disabled || isTranscribing || !micAvailable}
        className={`p-2 rounded-lg transition-all ${
          isRecording
            ? 'bg-red-500 text-white animate-pulse'
            : disabled || isTranscribing || !micAvailable
            ? 'text-geoff-text-dim cursor-not-allowed'
            : 'text-geoff-text-muted hover:text-geoff-text hover:bg-geoff-surface'
        }`}
        title={
          !micAvailable
            ? 'Microphone requires HTTPS'
            : isRecording
            ? voiceInputMode === 'push-to-talk'
              ? 'Release to send'
              : 'Click to stop'
            : voiceInputMode === 'push-to-talk'
            ? 'Hold to talk (or Space)'
            : 'Click to record'
        }
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isRecording ? (
            // Stop icon
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
          ) : (
            // Microphone icon
            <>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z"
              />
            </>
          )}
        </svg>
      </button>

      {/* Error tooltip */}
      {error && (
        <span className="text-xs text-geoff-error">{error}</span>
      )}
    </div>
  )
}
