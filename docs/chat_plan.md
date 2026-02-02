# Agent Chat Tab Implementation Plan

## Executive Summary

**Feasibility: HIGHLY FEASIBLE**

Adding an Agent Chat tab as the 4th navigation tab is well-supported by the existing architecture. The codebase already has WebSocket infrastructure for agent communication, a modular component system, and established patterns for state management that can be extended for bidirectional chat functionality.

## Overview

The Agent Chat feature enables users to have interactive conversations with AI agents directly from the web UI. Unlike the current orchestrator approach (launch agent with prompt → observe output → stop), the chat tab provides a conversational interface for:

- **Brainstorming** - Discuss ideas, architecture decisions, and approaches
- **Remote Task Execution** - Request specific actions through conversation
- **Real-time Collaboration** - Work alongside an agent interactively
- **Ad-hoc Queries** - Ask questions about the codebase without creating formal tasks

## Current Architecture Analysis

### Existing Components (What We Have)

| Component | Location | Current Function |
|-----------|----------|-----------------|
| Tab Navigation | `web/src/App.tsx:52-84` | 3 tabs: Tasks, Files, Settings |
| Tab Type | `web/src/App.tsx:14` | `type Tab = 'tasks' \| 'files' \| 'settings'` |
| Agent State | `web/src/hooks/useAgents.ts` | Zustand store for agents |
| WebSocket Stream | `orchestrator/src/orchestrator/api/websocket.py` | Output-only streaming |
| Agent Output | `web/src/components/agents/AgentPanel.tsx:63-95` | Read-only display |
| Agent Manager | `orchestrator/src/orchestrator/core/agent_manager.py` | Process lifecycle |

### Communication Flow (Current)

```
┌─────────────┐         POST /api/agents           ┌─────────────────┐
│   Web UI    │ ─────────────────────────────────▶ │   Orchestrator  │
│             │                                    │                 │
│  (Launch    │ ◀─────────────────────────────────│  (Spawn Agent)  │
│   Agent)    │       WebSocket: output only       │                 │
└─────────────┘                                    └────────┬────────┘
                                                            │
                                                            ▼
                                                   ┌─────────────────┐
                                                   │    AI Agent     │
                                                   │  (CLI Process)  │
                                                   │   stdout only   │
                                                   └─────────────────┘
```

### What Needs to Change

The key technical challenge is enabling **bidirectional communication** with the agent process:

```
┌─────────────┐      WebSocket (bidirectional)     ┌─────────────────┐
│   Web UI    │ ◀─────────────────────────────────▶│   Orchestrator  │
│             │                                    │                 │
│  Chat Tab   │    { type: "input", data: "..." }  │   Chat Handler  │
│  (send +    │    { type: "output", data: "..." } │                 │
│   receive)  │                                    │                 │
└─────────────┘                                    └────────┬────────┘
                                                            │
                                                   stdin ◀──┼──▶ stdout
                                                            │
                                                   ┌─────────────────┐
                                                   │    AI Agent     │
                                                   │  (CLI Process)  │
                                                   │  Interactive    │
                                                   │    Session      │
                                                   └─────────────────┘
```

## Technical Implementation Plan

### Phase 1: Frontend Tab & UI

#### 1.1 Add Chat Tab to Navigation

**File:** `web/src/App.tsx`

```typescript
// Update Tab type (line 14)
type Tab = 'tasks' | 'files' | 'settings' | 'chat'

// Add Chat button to nav (after Settings button, line 83)
<button
  onClick={() => setActiveTab('chat')}
  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
    activeTab === 'chat'
      ? 'bg-geoff-accent text-white'
      : 'text-geoff-text-muted hover:text-geoff-text hover:bg-geoff-surface'
  }`}
>
  Chat
</button>

// Add Chat content section (after settings section, ~line 136)
{activeTab === 'chat' && (
  <div className="space-y-6">
    <ProjectSelector />
    <AgentChat />
  </div>
)}
```

#### 1.2 Create AgentChat Component

**File:** `web/src/components/chat/AgentChat.tsx`

```typescript
import { useState, useEffect, useRef } from 'react'
import { useChat } from '../../hooks/useChat'
import { useProjects } from '../../hooks/useProjects'
import { useTasks } from '../../hooks/useTasks'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

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
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isTyping && (
          <div className="text-geoff-text-muted text-sm">Agent is typing...</div>
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
```

#### 1.3 Create Chat State Hook

**File:** `web/src/hooks/useChat.ts`

```typescript
import { create } from 'zustand'
import { orchestrator } from '../lib/orchestrator'

interface Message {
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
          if (data.type === 'output') {
            get().addMessage({ role: 'assistant', content: data.data })
            set({ isTyping: false })
          } else if (data.type === 'typing') {
            set({ isTyping: true })
          }
        },
        onClose: () => {
          set({ isConnected: false, ws: null, sessionId: null })
        }
      })

      set({ sessionId: session.id, isConnected: true, ws })

      // Add system message
      get().addMessage({
        role: 'system',
        content: `Connected to agent. Working directory: ${workingDir || 'default'}`
      })

    } catch (error) {
      console.error('Failed to start chat session:', error)
    }
  },

  endSession: () => {
    const { ws, sessionId } = get()
    if (ws) ws.close()
    if (sessionId) orchestrator.endChatSession(sessionId)
    set({ sessionId: null, isConnected: false, ws: null })
    get().addMessage({ role: 'system', content: 'Session ended.' })
  },

  sendMessage: (content) => {
    const { ws, isConnected } = get()
    if (!ws || !isConnected) return

    // Add user message to state
    get().addMessage({ role: 'user', content })

    // Send via WebSocket
    ws.send(JSON.stringify({ type: 'input', data: content }))
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, {
        ...message,
        id: crypto.randomUUID(),
        timestamp: new Date()
      }]
    }))
  },

  setTyping: (typing) => set({ isTyping: typing }),

  clearMessages: () => set({ messages: [] })
}))
```

### Phase 2: Backend Chat Support

#### 2.1 Add Chat Session Endpoint

**File:** `orchestrator/src/orchestrator/api/chat.py` (new file)

```python
"""Chat session endpoints for interactive agent communication."""

import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..core.agent_manager import get_agent_manager, AgentStatus
from ..core.config import get_settings
from ..core.security import verify_api_key

router = APIRouter()


class ChatSessionRequest(BaseModel):
    working_directory: Optional[str] = None
    provider: str = "claude"


@router.post("/api/chat/sessions")
async def start_chat_session(
    request: ChatSessionRequest,
    api_key: str = Query(..., alias="api_key"),
):
    """Start an interactive chat session with an agent."""
    verify_api_key(api_key)

    manager = get_agent_manager()

    # Launch agent in interactive mode (no initial prompt)
    agent = await manager.launch_chat_agent(
        working_directory=request.working_directory,
        provider=request.provider,
    )

    return {
        "session_id": agent.id,
        "status": agent.status.value,
        "provider": agent.provider,
    }


@router.delete("/api/chat/sessions/{session_id}")
async def end_chat_session(
    session_id: str,
    api_key: str = Query(..., alias="api_key"),
):
    """End a chat session."""
    verify_api_key(api_key)

    manager = get_agent_manager()
    success = await manager.stop_agent(session_id)

    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"success": True}


@router.websocket("/api/chat/sessions/{session_id}/ws")
async def chat_websocket(
    websocket: WebSocket,
    session_id: str,
    api_key: str = Query(..., alias="api_key"),
):
    """
    Bidirectional WebSocket for chat communication.

    Messages from client:
    - { "type": "input", "data": "user message" }

    Messages to client:
    - { "type": "output", "data": "agent response" }
    - { "type": "typing", "status": true/false }
    - { "type": "error", "message": "..." }
    """
    settings = get_settings()

    if api_key != settings.api_key:
        await websocket.close(code=4003, reason="Invalid API key")
        return

    await websocket.accept()

    manager = get_agent_manager()
    agent = manager.get_agent(session_id)

    if not agent:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close(code=4004)
        return

    # Subscribe to agent output
    output_queue = manager.subscribe_output(session_id)

    async def send_output():
        """Task to forward agent output to WebSocket."""
        try:
            while True:
                line = await asyncio.wait_for(output_queue.get(), timeout=30.0)
                if line is None:
                    break
                await websocket.send_json({"type": "output", "data": line})
        except asyncio.TimeoutError:
            await websocket.send_json({"type": "heartbeat"})
        except Exception:
            pass

    async def receive_input():
        """Task to forward WebSocket input to agent stdin."""
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "input":
                    user_input = data.get("data", "")
                    await manager.send_input(session_id, user_input)
        except WebSocketDisconnect:
            pass

    # Run both tasks concurrently
    output_task = asyncio.create_task(send_output())
    input_task = asyncio.create_task(receive_input())

    try:
        await asyncio.gather(output_task, input_task, return_exceptions=True)
    finally:
        output_task.cancel()
        input_task.cancel()
        manager.unsubscribe_output(session_id, output_queue)
```

#### 2.2 Update Agent Manager for Interactive Mode

**File:** `orchestrator/src/orchestrator/core/agent_manager.py` (add methods)

```python
async def launch_chat_agent(
    self,
    working_directory: Optional[str] = None,
    provider: str = "claude",
) -> Agent:
    """
    Launch an agent in interactive chat mode.

    Unlike task agents, chat agents:
    - Don't receive an initial prompt
    - Accept stdin input during execution
    - Run until explicitly stopped
    """
    registry = get_provider_registry()
    provider_impl = registry.get_provider(ProviderType(provider))

    # Build command for interactive mode (no -p flag)
    cmd = provider_impl.build_interactive_command(working_directory)

    # Create process with stdin PIPE enabled
    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=working_directory or self.settings.default_working_directory,
        stdin=asyncio.subprocess.PIPE,  # Enable stdin for input
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    agent = Agent(
        id=str(uuid.uuid4()),
        status=AgentStatus.RUNNING,
        provider=provider,
        working_directory=working_directory,
        started_at=datetime.utcnow(),
        process=process,
        output_buffer=[],
        output_subscribers=[],
        is_chat_mode=True,  # New flag
    )

    self.agents[agent.id] = agent
    asyncio.create_task(self._stream_output(agent))

    return agent


async def send_input(self, agent_id: str, message: str) -> bool:
    """Send input to an agent's stdin."""
    agent = self.agents.get(agent_id)
    if not agent or not agent.process or not agent.process.stdin:
        return False

    try:
        # Write message followed by newline
        agent.process.stdin.write(f"{message}\n".encode())
        await agent.process.stdin.drain()
        return True
    except Exception as e:
        print(f"Failed to send input to agent {agent_id}: {e}")
        return False
```

#### 2.3 Update Provider for Interactive Commands

**File:** `orchestrator/src/orchestrator/core/providers.py` (add method)

```python
class ClaudeProvider(Provider):
    # ... existing methods ...

    def build_interactive_command(self, working_directory: Optional[str] = None) -> list[str]:
        """Build command for interactive chat mode."""
        cmd = [self.command_path]

        # Don't add -p flag or prompt for interactive mode
        # Add flags for accepting stdin
        cmd.extend(["--dangerously-skip-permissions"])

        return cmd
```

### Phase 3: Integration & Polish

#### 3.1 Update Orchestrator Client Library

**File:** `web/src/lib/orchestrator.ts` (add methods)

```typescript
// Add to OrchestratorClient class

async startChatSession(workingDirectory?: string): Promise<{ id: string }> {
  const response = await this.fetch('/api/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ working_directory: workingDirectory }),
  })
  return response
}

async endChatSession(sessionId: string): Promise<void> {
  await this.fetch(`/api/chat/sessions/${sessionId}`, {
    method: 'DELETE',
  })
}

connectChatWebSocket(
  sessionId: string,
  handlers: {
    onMessage: (data: any) => void
    onClose: () => void
  }
): WebSocket {
  const wsUrl = `${this.wsBaseUrl}/api/chat/sessions/${sessionId}/ws?api_key=${this.apiKey}`
  const ws = new WebSocket(wsUrl)

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    handlers.onMessage(data)
  }

  ws.onclose = handlers.onClose

  return ws
}
```

#### 3.2 Register Chat Router

**File:** `orchestrator/src/orchestrator/main.py`

```python
from .api import agents, websocket, projects, filesystem, chat

# ... existing setup ...

app.include_router(chat.router, tags=["chat"])
```

## Alternative Approaches Considered

### Option A: Reuse Existing Agent Launch (Simpler, Less Interactive)

Instead of true bidirectional chat, we could:
1. Launch agents with prompts from chat input
2. Display output as messages
3. Each "message" starts a new agent

**Pros:** Minimal backend changes
**Cons:** Not truly interactive, each message is isolated

### Option B: External Chat Service (More Complex)

Integrate with an external LLM API directly from the frontend:
- Use Claude API, OpenAI API, etc. directly
- Skip orchestrator entirely for chat

**Pros:** Simpler architecture, no stdin complexity
**Cons:** Doesn't leverage CLI agent capabilities, no MCP access

### Option C: Hybrid Approach (Recommended)

Use the orchestrator for launching and managing the agent process, but handle the chat protocol at a higher level:

1. Agent launches in "chat server" mode
2. Communication happens via a structured protocol
3. Agent can still access MCP tools and filesystem

This is the approach detailed in this plan.

## UI/UX Considerations

### Chat Tab Layout

```
┌────────────────────────────────────────────────────────┐
│  [Tasks] [Files] [Settings] [Chat]     (4th position)  │
├────────────────────────────────────────────────────────┤
│  Project: [MyProject ▼]              [Start Session]   │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │ [System] Connected to agent. Working dir: /...   │  │
│  │                                                   │  │
│  │                           [User] How do I add... │  │
│  │                                                   │  │
│  │ [Agent] To add authentication, you'll need to... │  │
│  │                                                   │  │
│  │                   [User] Can you show me the...  │  │
│  │                                                   │  │
│  │ [Agent] Here's an example:                       │  │
│  │ ```typescript                                    │  │
│  │ const auth = new AuthService()                   │  │
│  │ ```                                              │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─────────────────────────────────────┐ [Send]       │
│  │ Type a message...                    │              │
│  └─────────────────────────────────────┘              │
└────────────────────────────────────────────────────────┘
```

### Key UX Features

1. **Session Persistence** - Chat history retained during session
2. **Clear Session Indicator** - Show connected/disconnected state
3. **Markdown Rendering** - Support code blocks, lists, etc.
4. **Auto-scroll** - Keep newest messages visible
5. **Keyboard Shortcuts** - Enter to send, Shift+Enter for newline
6. **Provider Selection** - Choose which AI to chat with

## Database Considerations (Optional)

For chat history persistence, add a new table:

```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);
```

This is optional for MVP - in-memory storage works initially.

## Implementation Phases Summary

| Phase | Scope | Complexity |
|-------|-------|------------|
| Phase 1 | Frontend Tab & Components | Small |
| Phase 2 | Backend Chat Support | Medium |
| Phase 3 | Integration & Polish | Small |
| Optional | Chat History Persistence | Small |

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| CLI agents may not support stdin well | Test with each provider, fall back to new-agent-per-message |
| WebSocket connection stability | Implement reconnection logic, heartbeats already exist |
| Large message handling | Add message chunking, streaming display |
| Session cleanup on disconnect | Implement timeout-based cleanup in agent manager |

## Conclusion

Adding an Agent Chat tab is highly feasible with the current architecture. The existing WebSocket infrastructure, component patterns, and state management approach provide a solid foundation. The main technical work involves:

1. Enabling stdin on agent processes
2. Creating a bidirectional WebSocket endpoint
3. Building the chat UI components

The implementation can be done incrementally, with Phase 1 providing immediate value and subsequent phases adding interactivity.
