import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { App } from '@capacitor/app'
import { Network } from '@capacitor/network'
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
  // Authoritative server buffer position the client has rendered, used as the
  // catch-up offset on reconnect so backgrounded output is replayed exactly once.
  outputLinesSeen: number

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
      outputLinesSeen: 0,

      startSession: async (workingDir) => {
        try {
          const existingSessionId = get().sessionId

          // If we have an existing session, try to reconnect to it first
          if (existingSessionId) {
            console.log('[SESSION] Found existing session, checking if still valid...')
            const status = await orchestrator.getChatSessionStatus(existingSessionId)

            if (status) {
              // Session still exists on server - reconnect to it
              console.log('[SESSION] Existing session still active, reconnecting...')
              set({ reconnectAttempts: 0 })
              get().connectWebSocket(existingSessionId)
              return
            } else {
              // Session expired/not found - clear it and create new
              console.log('[SESSION] Existing session expired, creating new one...')
              set({ sessionId: null, outputLinesSeen: 0 })
            }
          }

          // Launch a new chat-mode agent (fresh server buffer → offset resets)
          const session = await orchestrator.startChatSession(workingDir)
          set({ sessionId: session.id, reconnectAttempts: 0, outputLinesSeen: 0 })

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
        // Any in-flight partial is re-sent by server catch-up from `outputLinesSeen`,
        // so drop it here to avoid double-rendering on reconnect.
        set({ pendingAssistantMessage: null })

        const ws = orchestrator.connectChatWebSocket(sessionId, {
          onMessage: (data) => {
            if (data.type === 'output' && data.data) {
              // Accumulate streaming output into pending message
              get().appendToAssistant(data.data)
            } else if (data.type === 'message_complete') {
              // Finalize the accumulated message and advance the catch-up offset
              // to the server's authoritative buffer position.
              get().finalizeAssistantMessage()
              if (typeof data.buffer_len === 'number') {
                set({ outputLinesSeen: data.buffer_len })
              }
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
        }, get().outputLinesSeen)

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
          set({ sessionId: null, isReconnecting: false, outputLinesSeen: 0 })
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
            set({ sessionId: null, isReconnecting: false, outputLinesSeen: 0 })
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
        // Shared reconnect trigger. On iOS the WebSocket (and JS backoff timers)
        // die while backgrounded, so reconnection must be driven by the OS waking
        // the app — not by the in-page setTimeout chain. We reset the attempt
        // counter so a long background never permanently exhausts retries.
        const triggerReconnect = (source: string) => {
          const { sessionId, isConnected, isReconnecting } = get()
          // Guard against duplicate triggers: iOS fires appStateChange + resume
          // together (and the web shim also fires visibilitychange).
          if (sessionId && !isConnected && !isReconnecting) {
            console.log(`[RESUME] Reconnecting after ${source}`)
            set({ reconnectAttempts: 0 })
            get().attemptReconnect()
          }
        }

        // --- Web fallback: visibilitychange (unreliable on iOS, kept for browsers) ---
        const handleVisibilityChange = () => {
          if (!document.hidden) triggerReconnect('visibility restore')
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        // --- Native: Capacitor app lifecycle + network status ---
        // These plugins ship web implementations too, so this is safe in a browser.
        const appHandle = App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) triggerReconnect('app foreground')
        })
        const resumeHandle = App.addListener('resume', () => triggerReconnect('app resume'))
        const netHandle = Network.addListener('networkStatusChange', (status) => {
          if (status.connected) triggerReconnect('network online')
        })

        // Return combined cleanup
        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange)
          appHandle.then((h) => h.remove())
          resumeHandle.then((h) => h.remove())
          netHandle.then((h) => h.remove())
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
          outputLinesSeen: 0,
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
          outputLinesSeen: 0,
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
      // Only persist sessionId, messages, and the catch-up offset - not WebSocket state
      partialize: (state) => ({
        sessionId: state.sessionId,
        messages: state.messages,
        outputLinesSeen: state.outputLinesSeen,
      }),
      // Rehydrate Date objects from localStorage (they get serialized as strings)
      onRehydrateStorage: () => (state) => {
        if (state?.messages) {
          state.messages = state.messages.map((msg) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }))
        }
      },
    }
  )
)
