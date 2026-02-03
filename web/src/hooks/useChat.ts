import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
  isReconnecting: boolean
  isTyping: boolean
  ws: WebSocket | null
  pendingAssistantMessage: string | null
  reconnectAttempts: number
  lastDisconnectTime: number | null

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
  connectWebSocket: (sessionId: string) => void
  attemptReconnect: () => Promise<boolean>
  scheduleReconnect: () => void
  setupVisibilityListener: () => () => void
}

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY = 2000 // 2 seconds
const RECONNECT_MAX_DELAY = 30000 // 30 seconds

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      messages: [],
      isConnected: false,
      isReconnecting: false,
      isTyping: false,
      ws: null,
      pendingAssistantMessage: null,
      reconnectAttempts: 0,
      lastDisconnectTime: null,

      startSession: async (workingDir) => {
        try {
          // Launch a chat-mode agent
          const session = await orchestrator.startChatSession(workingDir)
          set({ sessionId: session.id, reconnectAttempts: 0 })

          // Connect WebSocket
          get().connectWebSocket(session.id)
        } catch (error) {
          console.error('Failed to start chat session:', error)
          get().addMessage({
            role: 'system',
            content: `Failed to start session: ${(error as Error).message}`,
          })
        }
      },

      connectWebSocket: (sessionId: string) => {
        const ws = orchestrator.connectChatWebSocket(sessionId, {
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
              get().finalizeAssistantMessage() // Finalize any pending message first
              get().addMessage({
                role: 'system',
                content: `Error: ${data.message || 'Unknown error'}`,
              })
              set({ isTyping: false })
            } else if (data.type === 'heartbeat') {
              // Server keepalive - session is healthy
            }
          },
          onClose: () => {
            console.log('[WS] Connection closed')
            set({
              isConnected: false,
              ws: null,
              lastDisconnectTime: Date.now(),
            })

            // Attempt automatic reconnection if session exists
            if (get().sessionId && !get().isReconnecting) {
              get().scheduleReconnect()
            }
          },
          onError: (error) => {
            console.error('[WS] Error:', error)
            set({ isConnected: false })
          },
        })

        ws.onopen = () => {
          console.log('[WS] Connection opened')
          set({
            isConnected: true,
            isReconnecting: false,
            reconnectAttempts: 0,
            ws,
          })

          // Only show connect message if this is initial connection
          if (get().messages.length === 0) {
            get().addMessage({
              role: 'system',
              content: 'Connected to agent.',
            })
          } else {
            get().addMessage({
              role: 'system',
              content: 'Reconnected successfully.',
            })
          }
        }

        set({ ws })
      },

      scheduleReconnect: () => {
        const state = get()

        if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          get().addMessage({
            role: 'system',
            content:
              'Failed to reconnect after multiple attempts. Session may have expired.',
          })
          set({ sessionId: null, isReconnecting: false })
          return
        }

        // Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped)
        const delay = Math.min(
          RECONNECT_BASE_DELAY * Math.pow(2, state.reconnectAttempts),
          RECONNECT_MAX_DELAY
        )

        console.log(
          `[RECONNECT] Scheduling attempt ${state.reconnectAttempts + 1} in ${delay}ms`
        )

        setTimeout(async () => {
          await get().attemptReconnect()
        }, delay)
      },

      attemptReconnect: async () => {
        const { sessionId, isConnected } = get()

        if (!sessionId || isConnected) return false

        set({ isReconnecting: true })

        try {
          // Check if session still exists on server
          const status = await orchestrator.getChatSessionStatus(sessionId)

          if (!status) {
            // Session cleaned up or doesn't exist
            get().addMessage({
              role: 'system',
              content: 'Session expired. Please start a new session.',
            })
            set({ sessionId: null, isReconnecting: false })
            return false
          }

          // Session exists - reconnect WebSocket
          console.log('[RECONNECT] Session still active, reconnecting...')
          set({ reconnectAttempts: get().reconnectAttempts + 1 })
          get().connectWebSocket(sessionId)

          return true
        } catch (error) {
          console.error('[RECONNECT] Failed:', error)
          set({
            reconnectAttempts: get().reconnectAttempts + 1,
            isReconnecting: false,
          })

          // Schedule next attempt
          get().scheduleReconnect()
          return false
        }
      },

      setupVisibilityListener: () => {
        const handleVisibilityChange = () => {
          if (document.hidden) {
            // Page hidden (mobile backgrounded, tab switched)
            console.log('[VISIBILITY] Page hidden')
            // WebSocket will naturally disconnect, but session stays alive
          } else {
            // Page visible again
            console.log('[VISIBILITY] Page visible')
            const { sessionId, isConnected } = get()

            // If we have a session but not connected, try to reconnect
            if (sessionId && !isConnected) {
              console.log(
                '[VISIBILITY] Attempting reconnection after visibility restore'
              )
              get().attemptReconnect()
            }
          }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)

        // Return cleanup function
        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
      },

      endSession: () => {
        const { ws, sessionId } = get()
        if (ws) ws.close()
        if (sessionId) {
          orchestrator.endChatSession(sessionId).catch(console.error)
        }
        set({
          sessionId: null,
          isConnected: false,
          ws: null,
          reconnectAttempts: 0,
        })
        get().addMessage({ role: 'system', content: 'Session ended.' })
      },

      // Called when the agent is stopped from AgentPanel (external disconnection)
      disconnectFromStoppedSession: () => {
        const { ws } = get()

        // Close WebSocket if open
        if (
          ws &&
          (ws.readyState === WebSocket.OPEN ||
            ws.readyState === WebSocket.CONNECTING)
        ) {
          ws.close()
        }

        // Update state (don't call orchestrator.endChatSession - agent already stopped)
        set({
          sessionId: null,
          isConnected: false,
          ws: null,
          reconnectAttempts: 0,
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
          messages: [
            ...state.messages,
            {
              ...message,
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              timestamp: new Date(),
            },
          ],
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

      clearMessages: () => set({ messages: [], pendingAssistantMessage: null }),
    }),
    {
      name: 'geoff-chat-storage',
      // Only persist sessionId and messages - not WebSocket state
      partialize: (state) => ({
        sessionId: state.sessionId,
        messages: state.messages,
      }),
    }
  )
)
