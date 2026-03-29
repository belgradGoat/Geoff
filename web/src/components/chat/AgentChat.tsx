import { useState, useEffect, useRef } from 'react'
import { useChat, Message } from '../../hooks/useChat'
import { useVoice } from '../../hooks/useVoice'
import { useTasks } from '../../hooks/useTasks'
import { useProjects } from '../../hooks/useProjects'
import { VoiceControls } from './VoiceControls'
import { TTSButton } from './TTSButton'

export function AgentChat() {
  const {
    messages,
    isConnected,
    isReconnecting,
    isTyping,
    sendMessage,
    startSession,
    endSession,
    pendingAssistantMessage,
    setupVisibilityListener
  } = useChat()

  const { autoPlayTTS, ttsEnabled, speakText } = useVoice()
  const { projectFilter } = useTasks()
  const { projects } = useProjects()
  const selectedProject = projects.find(p => p.id === projectFilter)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageCountRef = useRef(messages.length)

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingAssistantMessage])

  // Setup visibility change listener on mount
  useEffect(() => {
    const cleanup = setupVisibilityListener()
    return cleanup
  }, [setupVisibilityListener])

  // Auto-play TTS on new assistant messages
  useEffect(() => {
    if (autoPlayTTS && ttsEnabled && messages.length > lastMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg.role === 'assistant') {
        speakText(lastMsg.content)
      }
    }
    lastMessageCountRef.current = messages.length
  }, [messages.length, autoPlayTTS, ttsEnabled, speakText])

  const handleTranscription = (text: string) => {
    setInput(text)
  }

  const handleSend = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="card p-4 h-[calc(100vh-200px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-geoff-text">Agent Chat</h2>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-geoff-success' :
            isReconnecting ? 'bg-yellow-500 animate-pulse' :
            'bg-geoff-error'
          }`} />
          <span className="text-sm text-geoff-text-muted">
            {isConnected ? 'Connected' :
             isReconnecting ? 'Reconnecting...' :
             'Disconnected'}
          </span>
          {!isConnected ? (
            <button
              onClick={() => startSession(selectedProject?.path)}
              className="btn-primary text-sm"
            >
              Start Session
            </button>
          ) : (
            <button
              onClick={endSession}
              className="btn-secondary text-sm"
            >
              End Session
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 && !isConnected && (
          <div className="flex items-center justify-center h-full text-geoff-text-muted">
            <div className="text-center">
              <p className="text-lg mb-2">Start a chat session to talk with an AI agent</p>
              <p className="text-sm">
                {selectedProject
                  ? `Working directory: ${selectedProject.path}`
                  : 'Select a project to set the working directory'}
              </p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {/* Show streaming message as it builds up */}
        {pendingAssistantMessage && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg p-3 bg-geoff-surface border border-geoff-border text-geoff-text">
              <div className="whitespace-pre-wrap text-sm">{pendingAssistantMessage}</div>
              <div className="text-xs mt-1 text-geoff-text-dim animate-pulse">
                streaming...
              </div>
            </div>
          </div>
        )}
        {isTyping && !pendingAssistantMessage && (
          <div className="text-geoff-text-muted text-sm animate-pulse">Agent is typing...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? "Type a message..." : "Start a session to chat"}
          disabled={!isConnected}
          rows={2}
          className="input flex-1 resize-none"
        />
        <VoiceControls
          onTranscription={handleTranscription}
          disabled={!isConnected}
        />
        <button
          onClick={handleSend}
          disabled={!isConnected || !input.trim()}
          className="btn-primary"
        >
          Send
        </button>
      </div>
    </div>
  )
}

function ChatMessage({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const handleCopy = async () => {
    if (!message.content) return
    setCopyError(false)

    // Try modern Clipboard API first
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(message.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        return
      } catch (e) {
        console.warn('Clipboard API failed, trying fallback:', e)
      }
    }

    // Fallback for non-secure contexts (HTTP) or older browsers
    try {
      const textArea = document.createElement('textarea')
      textArea.value = message.content
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      textArea.style.top = '-9999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)

      if (successful) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        throw new Error('execCommand returned false')
      }
    } catch (e) {
      console.error('Failed to copy message:', e)
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2000)
    }
  }

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-geoff-surface/50 border border-geoff-border rounded-lg px-4 py-2 text-sm text-geoff-text-muted">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-lg p-3 ${
        isUser
          ? 'bg-geoff-accent text-white'
          : 'bg-geoff-surface border border-geoff-border text-geoff-text'
      }`}>
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        <div className={`flex items-center justify-between mt-1 ${isUser ? 'text-white/70' : 'text-geoff-text-dim'}`}>
          <span className="text-xs">
            {message.timestamp.toLocaleTimeString()}
          </span>
          <div className="flex items-center gap-1">
          {!isUser && (
            <TTSButton text={message.content} isUser={isUser} />
          )}
          <button
            type="button"
            onClick={handleCopy}
            className={`text-xs px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer ${
              copied
                ? 'text-green-500'
                : copyError
                ? 'text-red-500'
                : isUser
                ? 'hover:bg-white/10'
                : 'hover:bg-geoff-border'
            }`}
            title={copied ? 'Copied!' : copyError ? 'Failed to copy' : 'Copy message'}
          >
            {copied ? (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Copied</span>
              </>
            ) : copyError ? (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Failed</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}
