import { create } from 'zustand'
import { orchestrator } from '../lib/orchestrator'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

interface ChatState {
  sessionId: string | null
  messages: Message[]
  isConnected: boolean
  isTyping: boolean
  ws: WebSocket | null
  pendingAssistantMessage: string | null  // Accumulates streaming output

  // Actions
  startSession: (workingDir?: string) => Promise<void>
  endSession: () => void
  disconnectFromStoppedSession: () => void
  sendMessage: (content: string) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  appendToAssistant: (content: string) => void
  finalizeAssistantMessage: () => void
  setTyping: (typing: boolean) => void
  clearMessages: () => void
}

export const useChat = create<ChatState>((set, get) => ({
  sessionId: null,
  messages: [],
  isConnected: false,
  isTyping: false,
  ws: null,
  pendingAssistantMessage: null,

  startSession: async (workingDir) => {
    try {
      // Launch a chat-mode agent
      const session = await orchestrator.startChatSession(workingDir)

      // Connect WebSocket for bidirectional communication
      const ws = orchestrator.connectChatWebSocket(session.id, {
        onMessage: (data) => {
          if (data.type === 'output' && data.data) {
            // Accumulate streaming output into pending message
            get().appendToAssistant(data.data)
          } else if (data.type === 'message_complete') {
            // Finalize the accumulated message
            get().finalizeAssistantMessage()
            set({ isTyping: false })
          } else if (data.type === 'typing') {
            set({ isTyping: true })
          } else if (data.type === 'error') {
            get().finalizeAssistantMessage()  // Finalize any pending message first
            get().addMessage({ role: 'system', content: `Error: ${data.message || 'Unknown error'}` })
            set({ isTyping: false })
          }
        },
        onClose: () => {
          set({ isConnected: false, ws: null, sessionId: null })
          get().addMessage({ role: 'system', content: 'Session disconnected.' })
        },
        onError: (error) => {
          console.error('WebSocket error:', error)
          set({ isConnected: false })
          get().addMessage({ role: 'system', content: 'Connection error occurred.' })
        }
      })

      // Store WebSocket and session ID, but wait for connection before setting isConnected
      set({ sessionId: session.id, ws, isConnected: false })

      // Wait for WebSocket to actually open before marking as connected
      ws.onopen = () => {
        set({ isConnected: true })
        get().addMessage({
          role: 'system',
          content: `Connected to agent. Working directory: ${workingDir || 'default'}`
        })
      }

    } catch (error) {
      console.error('Failed to start chat session:', error)
      get().addMessage({
        role: 'system',
        content: `Failed to start session: ${(error as Error).message}`
      })
    }
  },

  endSession: () => {
    const { ws, sessionId } = get()
    if (ws) ws.close()
    if (sessionId) {
      orchestrator.endChatSession(sessionId).catch(console.error)
    }
    set({ sessionId: null, isConnected: false, ws: null })
    get().addMessage({ role: 'system', content: 'Session ended.' })
  },

  // Called when the agent is stopped from AgentPanel (external disconnection)
  disconnectFromStoppedSession: () => {
    const { ws } = get()

    // Close WebSocket if open
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close()
    }

    // Update state (don't call orchestrator.endChatSession - agent already stopped)
    set({
      sessionId: null,
      isConnected: false,
      ws: null,
    })

    // Add system message
    get().addMessage({ role: 'system', content: 'Session ended externally.' })
  },

  sendMessage: (content) => {
    const { ws, isConnected } = get()
    if (!ws || !isConnected || ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message: WebSocket not ready')
      return
    }

    // Handle /clear locally for instant feedback
    if (content.trim() === '/clear') {
      set({ messages: [], pendingAssistantMessage: null })
      get().addMessage({ role: 'system', content: 'Chat history cleared.' })
      return
    }

    // Add user message to state
    get().addMessage({ role: 'user', content })

    // Send via WebSocket
    ws.send(JSON.stringify({ type: 'input', data: content }))

    // Set typing indicator
    set({ isTyping: true })
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, {
        ...message,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        timestamp: new Date()
      }]
    }))
  },

  appendToAssistant: (content) => {
    set((state) => {
      const current = state.pendingAssistantMessage
      // Append new line to pending message (with newline separator if not first line)
      const newContent = current ? `${current}\n${content}` : content
      return { pendingAssistantMessage: newContent }
    })
  },

  finalizeAssistantMessage: () => {
    const { pendingAssistantMessage } = get()
    if (pendingAssistantMessage) {
      get().addMessage({ role: 'assistant', content: pendingAssistantMessage })
      set({ pendingAssistantMessage: null })
    }
  },

  setTyping: (typing) => set({ isTyping: typing }),

  clearMessages: () => set({ messages: [], pendingAssistantMessage: null })
}))
