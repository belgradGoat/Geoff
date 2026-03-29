import { useVoice } from '../../hooks/useVoice'

interface TTSButtonProps {
  text: string
  isUser?: boolean
}

export function TTSButton({ text, isUser }: TTSButtonProps) {
  const { ttsEnabled, isSpeaking, speakText, stopSpeaking } = useVoice()

  if (!ttsEnabled) return null

  const handleClick = () => {
    if (isSpeaking) {
      stopSpeaking()
    } else {
      speakText(text)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`text-xs px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer ${
        isSpeaking
          ? 'text-geoff-accent'
          : isUser
          ? 'hover:bg-white/10'
          : 'hover:bg-geoff-border'
      }`}
      title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
    >
      {isSpeaking ? (
        <>
          <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
          <span>Stop</span>
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.8l4.2-3.15A.5.5 0 0111.5 6v12a.5.5 0 01-.8.4L6.5 15.2H4a1 1 0 01-1-1v-4.4a1 1 0 011-1h2.5z"
            />
          </svg>
          <span>Speak</span>
        </>
      )}
    </button>
  )
}
