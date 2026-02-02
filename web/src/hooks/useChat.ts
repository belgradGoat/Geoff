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

  // Actions
  startSession: (workingDir?: string) => Promise<void>
  endSession: () => void
  sendMessage: (content: string) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  setTyping: (typing: boolean) => void
  clearMessages: () => void
}

export const useChat = create<ChatState>((set, get) => ({
  sessionId: null,
  messages: [],
  isConnected: false,
  isTyping: false,
  ws: null,

  startSession: async (workingDir) => {
    try {
      // Launch a chat-mode agent
      const session = await orchestrator.startChatSession(workingDir)

      // Connect WebSocket for bidirectional communication
      const ws = orchestrator.connectChatWebSocket(session.id, {
        onMessage: (data) => {
          if (data.type === 'output' && data.data) {
            get().addMessage({ role: 'assistant', content: data.data })
            set({ isTyping: false })
          } else if (data.type === 'typing') {
            set({ isTyping: true })
          } else if (data.type === 'error') {
            get().addMessage({ role: 'system', content: `Error: ${data.message || 'Unknown error'}` })
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

  sendMessage: (content) => {
    const { ws, isConnected } = get()
    if (!ws || !isConnected || ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message: WebSocket not ready')
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

  setTyping: (typing) => set({ isTyping: typing }),

  clearMessages: () => set({ messages: [] })
}))
