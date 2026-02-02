import { useState, useEffect, useRef } from 'react'
import { useChat, Message } from '../../hooks/useChat'
import { useTasks } from '../../hooks/useTasks'
import { useProjects } from '../../hooks/useProjects'

export function AgentChat() {
  const {
    messages,
    isConnected,
    isTyping,
    sendMessage,
    startSession,
    endSession
  } = useChat()

  const { projectFilter } = useTasks()
  const { projects } = useProjects()
  const selectedProject = projects.find(p => p.id === projectFilter)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
            isConnected ? 'bg-geoff-success' : 'bg-geoff-error'
          }`} />
          <span className="text-sm text-geoff-text-muted">
            {isConnected ? 'Connected' : 'Disconnected'}
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
        {isTyping && (
          <div className="text-geoff-text-muted text-sm animate-pulse">Agent is typing...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? "Type a message..." : "Start a session to chat"}
          disabled={!isConnected}
          rows={2}
          className="input flex-1 resize-none"
        />
        <button
          onClick={handleSend}
          disabled={!isConnected || !input.trim()}
          className="btn-primary self-end"
        >
          Send
        </button>
      </div>
    </div>
  )
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

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
        <div className={`text-xs mt-1 ${isUser ? 'text-white/70' : 'text-geoff-text-dim'}`}>
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
