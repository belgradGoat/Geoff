# Agent Task Planner

## Overview

A lightweight task management system designed for solo developer workflow where:
- Tasks are captured throughout the day (mobile/desktop)
- AI agents execute tasks autonomously ("lights-out coding")
- Agents report back status, progress, and failures
- Task dependencies are tracked and respected
- **Agents can be launched remotely** from anywhere via Tailscale
- **Live monitoring** of agent output through web UI

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  You (Phone / Remote Laptop)                 │
│                      Anywhere in the world                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Tailscale (private mesh VPN)
                      │ Access: https://your-machine:3000
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│   PWA (Progressive Web App) - works on mobile + desktop     │
│   - Responsive web UI                                        │
│   - "Add to Home Screen" on phone                           │
│   - No app store, no developer account needed               │
│   - Agent control panel (launch, stop, monitor)             │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
┌──────────────────┐    ┌─────────────────────────────────────┐
│ Supabase Backend │    │      Agent Orchestrator Service      │
│  - PostgreSQL    │    │   - Runs on your home machine        │
│  - Real-time     │    │   - REST API + WebSocket             │
│  - Free tier OK  │    │   - Spawns/stops Claude Code         │
└────────┬─────────┘    │   - Streams live output              │
         │              │   - Protected by API key             │
         │              └─────────────────┬───────────────────┘
         │                                │
         │              ┌─────────────────┼─────────────────┐
         │              │                 │                 │
         │              ▼                 ▼                 ▼
         │      ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
         │      │ Claude Code │   │ Claude Code │   │ Claude Code │
         │      │  Agent #1   │   │  Agent #2   │   │  Agent #N   │
         │      └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
         │             │                 │                 │
         │             └─────────────────┼─────────────────┘
         │                               │
         │                               ▼
         │              ┌─────────────────────────────────────┐
         └─────────────▶│            MCP Server               │
                        │   - Task operations for agents      │
                        │   - Connects to Supabase            │
                        │   - Python + FastMCP                │
                        └─────────────────────────────────────┘
```

### Remote Access via Tailscale

Tailscale creates a secure private network between your devices:

1. **Home Machine** - Runs the orchestrator, MCP server, and spawns agents
2. **Phone/Laptop** - Joins same Tailscale network, accesses home machine directly
3. **No port forwarding** - Works through NAT, firewalls, etc.
4. **Always encrypted** - WireGuard-based, no exposed public endpoints

```
Setup:
1. Install Tailscale on home machine + phone
2. Join same Tailscale account
3. Access orchestrator at http://[tailscale-ip]:8080
4. Access web UI at http://[tailscale-ip]:3000
```

## Data Model

### tasks

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| title | text | Short task name |
| description | text | Full task details, context |
| status | enum | queued, ready, assigned, in_progress, done, failed, blocked |
| priority | int | 1 (highest) to 5 (lowest) |
| acceptance_criteria | text[] | List of criteria for task completion |
| dependencies | uuid[] | Array of task IDs that must complete first |
| parent_task_id | uuid | Optional - for subtask relationships |
| estimated_complexity | enum | trivial, small, medium, large, unknown |
| assigned_agent | text | Which agent claimed this task |
| created_at | timestamptz | When task was created |
| updated_at | timestamptz | Last modification |
| started_at | timestamptz | When agent began work (in_progress) |
| completed_at | timestamptz | When marked done/failed |
| retry_count | int | Number of times task has been retried (default 0) |
| max_retries | int | Maximum retry attempts before permanent failure (default 3) |

### task_logs

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| task_id | uuid | Foreign key to tasks |
| timestamp | timestamptz | When event occurred |
| agent_id | text | Which agent (or 'human') |
| event_type | enum | created, status_change, note, error, completed, failed |
| content | text | Log message, error details, notes |

### projects (optional, phase 2)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Project name |
| description | text | Project context |
| repo_path | text | Local git repo path |

## Row Level Security (RLS) Policies

Even for solo use, RLS policies protect against accidental data exposure and provide a foundation for future multi-user support.

```sql
-- Enable RLS on all tables
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Service role (MCP server) has full access
CREATE POLICY "Service role full access" ON tasks
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON task_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Policy: Anon users (web UI) can read/write their own data
-- For solo use, allow all authenticated or use a simple API key check
CREATE POLICY "Anon read access" ON tasks
  FOR SELECT USING (true);

CREATE POLICY "Anon write access" ON tasks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update access" ON tasks
  FOR UPDATE USING (true);

-- task_logs: read-only for web UI, agents write via service role
CREATE POLICY "Anon read logs" ON task_logs
  FOR SELECT USING (true);
```

## Status Transitions & Dependency Resolution

### Status State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌────────┐    ┌─────────┐    ┌──────────┐    ┌──────┐    │
│ queued │───▶│  ready  │───▶│ assigned │───▶│ done │    │
└────────┘    └─────────┘    └──────────┘    └──────┘    │
     │             │              │                       │
     │             │              ▼                       │
     │             │         ┌─────────────┐             │
     │             │         │ in_progress │─────────────┘
     │             │         └─────────────┘        (retry)
     │             │              │
     │             ▼              ▼
     │        ┌─────────┐    ┌────────┐
     └───────▶│ blocked │    │ failed │
              └─────────┘    └────────┘
```

### Automatic Dependency Resolution

A database trigger evaluates task readiness when dependencies complete:

```sql
-- Function to check and update task readiness
CREATE OR REPLACE FUNCTION check_task_readiness()
RETURNS TRIGGER AS $$
BEGIN
  -- When a task completes, check if any blocked tasks can become ready
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    UPDATE tasks
    SET status = 'ready', updated_at = NOW()
    WHERE status IN ('queued', 'blocked')
      AND id != NEW.id
      AND NOT EXISTS (
        -- Check if any dependency is NOT done
        SELECT 1 FROM unnest(dependencies) AS dep_id
        WHERE dep_id NOT IN (
          SELECT id FROM tasks WHERE status = 'done'
        )
      )
      AND array_length(dependencies, 1) > 0;
  END IF;

  -- Also set tasks with no dependencies to ready if queued
  UPDATE tasks
  SET status = 'ready', updated_at = NOW()
  WHERE status = 'queued'
    AND (dependencies IS NULL OR array_length(dependencies, 1) = 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_readiness
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_task_readiness();
```

## Concurrency & Conflict Handling

### Optimistic Locking for Task Claims

Prevent race conditions when multiple agents attempt to claim the same task:

```sql
-- claim_task implementation (in MCP server)
-- Uses WHERE clause to ensure atomic claim
UPDATE tasks
SET
  status = 'assigned',
  assigned_agent = $agent_id,
  updated_at = NOW()
WHERE id = $task_id
  AND status = 'ready'
  AND assigned_agent IS NULL
RETURNING id;

-- If no rows returned, task was already claimed
```

### MCP Server Claim Implementation

```python
async def claim_task(task_id: str, agent_id: str) -> dict:
    """Atomically claim a task, preventing double-assignment."""
    result = await supabase.table('tasks').update({
        'status': 'assigned',
        'assigned_agent': agent_id,
        'updated_at': datetime.utcnow().isoformat()
    }).eq('id', task_id).eq('status', 'ready').is_('assigned_agent', None).execute()

    if not result.data:
        raise TaskClaimError(f"Task {task_id} is not available for claiming")

    # Log the claim
    await supabase.table('task_logs').insert({
        'task_id': task_id,
        'agent_id': agent_id,
        'event_type': 'status_change',
        'content': f'Task claimed by {agent_id}'
    }).execute()

    return result.data[0]
```

## Task Complexity Guidelines

### Complexity Definitions

| Complexity | Description | Typical Scope |
|------------|-------------|---------------|
| trivial | Single-line fix, typo, config change | < 5 minutes of work |
| small | Single function/component, clear scope | 5-30 minutes |
| medium | Multiple files, some design decisions | 30 min - 2 hours |
| large | Feature implementation, multiple components | 2+ hours, consider breaking down |
| unknown | Needs investigation before estimating | Agent should add_note with findings |

### Agent Behavior by Complexity

- **trivial/small:** Agent can proceed immediately after claiming
- **medium:** Agent should add_note with approach before starting
- **large:** Agent should use add_subtask to break down, then work on subtasks
- **unknown:** Agent should investigate, update complexity estimate, then re-evaluate

## Agent Orchestrator Service

The orchestrator is a local service that spawns and manages Claude Code agent sessions, accessible remotely via Tailscale.

### Data Model

#### agent_sessions

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Human-readable session name (e.g., "agent-1") |
| status | enum | idle, running, stopped, crashed |
| pid | int | OS process ID when running |
| started_at | timestamptz | When session was launched |
| stopped_at | timestamptz | When session ended |
| current_task_id | uuid | Task currently being worked on |
| working_directory | text | Repo path for this session |
| config | jsonb | Agent-specific configuration |

### Orchestrator REST API

Base URL: `http://[tailscale-ip]:8080`

#### Session Management

```
POST   /api/agents                    # Launch new agent session
GET    /api/agents                    # List all agent sessions
GET    /api/agents/:id                # Get session details
DELETE /api/agents/:id                # Stop agent session
POST   /api/agents/:id/restart        # Restart crashed/stopped agent
```

#### Batch Operations

```
POST   /api/batch/start               # Launch agents for all ready tasks
POST   /api/batch/stop                # Stop all running agents
GET    /api/batch/status              # Summary of all agents + tasks
```

#### Live Output Streaming

```
WebSocket: ws://[tailscale-ip]:8080/api/agents/:id/stream

Events:
- { type: "stdout", data: "..." }
- { type: "stderr", data: "..." }
- { type: "status", status: "running|stopped|crashed" }
- { type: "task", action: "claimed|completed|failed", task_id: "..." }
```

### Launch Agent Request

```json
POST /api/agents
{
  "name": "agent-1",
  "working_directory": "/path/to/repo",
  "auto_claim": true,
  "task_filter": {
    "priority_max": 3,
    "complexity": ["trivial", "small", "medium"]
  },
  "prompt": "Work through ready tasks from the task planner. Claim one at a time."
}
```

### Agent Lifecycle

```
┌────────┐   POST /agents   ┌─────────┐   task done   ┌────────┐
│  idle  │────────────────▶│ running │──────────────▶│  idle  │
└────────┘                  └─────────┘               └────────┘
                                 │                        │
                          crash/error              DELETE /agents/:id
                                 │                        │
                                 ▼                        ▼
                           ┌─────────┐             ┌─────────┐
                           │ crashed │             │ stopped │
                           └─────────┘             └─────────┘
```

### Security

- **API Key Auth**: All orchestrator endpoints require `X-API-Key` header
- **Tailscale Only**: Orchestrator binds to Tailscale interface only (not 0.0.0.0)
- **No Public Exposure**: Never accessible from public internet

```python
# Example: Bind only to Tailscale interface
ORCHESTRATOR_HOST = "100.x.x.x"  # Your Tailscale IP
ORCHESTRATOR_PORT = 8080
```

### Agent Spawning Implementation

```python
import subprocess
import asyncio
from pathlib import Path

class AgentManager:
    def __init__(self):
        self.sessions: dict[str, AgentSession] = {}

    async def launch_agent(
        self,
        name: str,
        working_directory: str,
        prompt: str
    ) -> AgentSession:
        """Spawn a new Claude Code agent session."""

        # Build the claude command
        cmd = [
            "claude",
            "--print",  # Non-interactive mode
            "--output-format", "json",
            prompt
        ]

        # Spawn the process
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=working_directory,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        session = AgentSession(
            id=str(uuid.uuid4()),
            name=name,
            pid=process.pid,
            process=process,
            status="running",
            working_directory=working_directory,
            started_at=datetime.utcnow()
        )

        self.sessions[session.id] = session

        # Start output streaming task
        asyncio.create_task(self._stream_output(session))

        return session

    async def stop_agent(self, session_id: str) -> None:
        """Gracefully stop an agent session."""
        session = self.sessions.get(session_id)
        if session and session.process:
            session.process.terminate()
            await session.process.wait()
            session.status = "stopped"
            session.stopped_at = datetime.utcnow()
```

## MCP Server Tools

Tools exposed to Claude Code agents:

### Query Tools
- `list_tasks(status_filter?, priority_filter?)` - Get tasks matching criteria
- `get_task(id)` - Full task details including acceptance criteria
- `get_ready_tasks()` - Tasks with all dependencies satisfied, status=ready
- `get_task_tree(id)` - Task with all subtasks
- `get_blocked_tasks()` - Tasks waiting on dependencies

### Mutation Tools
- `claim_task(id, agent_id)` - Mark task as assigned, prevents double-work
- `update_progress(id, note)` - Add progress note, keeps status as in_progress
- `complete_task(id, summary)` - Mark done, record completion summary
- `fail_task(id, reason)` - Mark failed with diagnosis
- `add_subtask(parent_id, title, description, acceptance_criteria)` - Break down work
- `add_note(id, content)` - Add observation without status change

### Orchestrator Tools
- `evaluate_batch()` - Analyze ready tasks, suggest execution order
- `get_dependency_graph()` - Full dependency visualization data
- `estimate_batch_time()` - Rough estimate for ready tasks

## Web UI Features

### Mobile-First Capture View
- Quick add: title only, defaults to queued/medium priority
- Tap to expand: add description, priority, dependencies
- Voice input button (browser native)
- Swipe actions: quick priority change

### Desktop Management View
- Kanban board (by status)
- List view with filters
- Dependency graph visualization
- Task detail panel with full editing
- Batch selection for "tonight's run"
- Log viewer per task

### Agent Control Panel
- Launch agent button (one-click start)
- Agent status cards (running, idle, stopped, crashed)
- Live output terminal (WebSocket stream)
- Stop/restart controls per agent
- Batch launch: "Run all ready tasks"
- Resource monitor (CPU/memory of agent processes)

### Shared Features
- Real-time sync (Supabase subscriptions)
- Offline support (PWA cache, sync when online)
- Dark mode
- Tailscale-aware: detects if accessed via Tailscale network

## Tech Stack

### Frontend
- **Framework:** React + Vite (fast, simple)
- **Styling:** Tailwind CSS
- **State:** Zustand (lightweight)
- **Supabase client:** @supabase/supabase-js
- **PWA:** vite-plugin-pwa

### Backend
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (optional, can skip initially)
- **Real-time:** Supabase Realtime

### MCP Server
- **Language:** Python 3.11+
- **Framework:** FastMCP
- **DB client:** supabase-py

### Agent Orchestrator
- **Language:** Python 3.11+
- **Framework:** FastAPI + uvicorn
- **WebSocket:** starlette (included with FastAPI)
- **Process Management:** asyncio.subprocess
- **Remote Access:** Tailscale (installed separately)

## Development Phases

### Phase 1: Foundation
- [ ] Set up Supabase project
- [ ] Create database schema (tasks, task_logs)
- [ ] Configure RLS policies
- [ ] Add dependency resolution trigger
- [ ] Basic MCP server with core tools (list, get, claim, complete, fail)
- [ ] Implement atomic task claiming (concurrency-safe)
- [ ] Test MCP server with Claude Code manually

### Phase 2: Minimal Web UI
- [ ] Vite + React project setup
- [ ] Supabase client connection
- [ ] Task list view (read-only)
- [ ] Quick add task form
- [ ] Basic status updates

### Phase 3: Full Web UI
- [ ] Kanban board view
- [ ] Task detail editing
- [ ] Dependency selection UI
- [ ] Acceptance criteria editor
- [ ] Real-time sync working

### Phase 4: PWA + Mobile
- [ ] PWA manifest + service worker
- [ ] Responsive mobile layout
- [ ] Offline task creation (queue for sync)
- [ ] "Add to Home Screen" tested on iOS/Android

### Phase 5: Agent Orchestrator
- [ ] Basic orchestrator service (FastAPI)
- [ ] Agent spawning/stopping endpoints
- [ ] WebSocket output streaming
- [ ] API key authentication
- [ ] Tailscale setup and binding
- [ ] Web UI: agent control panel
- [ ] Web UI: live output terminal component

### Phase 6: Orchestrator Features
- [ ] Batch evaluation tool
- [ ] Dependency graph visualization
- [ ] Execution history/analytics
- [ ] Agent performance tracking
- [ ] Auto-scaling (spawn agents based on queue depth)
- [ ] Agent health monitoring and auto-restart

## File Structure

```
AgentTaskPlanner/
├── PLAN.md                 # This file
├── README.md               # User-facing docs
├── docker-compose.yml      # Optional: run all services together
│
├── mcp-server/
│   ├── pyproject.toml
│   ├── src/
│   │   └── agent_task_planner/
│   │       ├── __init__.py
│   │       ├── server.py       # FastMCP server
│   │       ├── db.py           # Supabase client
│   │       └── tools.py        # MCP tool definitions
│   └── tests/
│
├── orchestrator/
│   ├── pyproject.toml
│   ├── src/
│   │   └── orchestrator/
│   │       ├── __init__.py
│   │       ├── main.py         # FastAPI app entrypoint
│   │       ├── api/
│   │       │   ├── __init__.py
│   │       │   ├── agents.py   # Agent CRUD endpoints
│   │       │   ├── batch.py    # Batch operations
│   │       │   └── websocket.py # Output streaming
│   │       ├── core/
│   │       │   ├── __init__.py
│   │       │   ├── agent_manager.py  # Process spawning
│   │       │   ├── config.py         # Settings
│   │       │   └── security.py       # API key auth
│   │       └── models/
│   │           ├── __init__.py
│   │           └── session.py  # AgentSession model
│   └── tests/
│
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── tasks/          # Task management components
│   │   │   └── agents/         # Agent control components
│   │   │       ├── AgentCard.tsx
│   │   │       ├── AgentPanel.tsx
│   │   │       ├── LaunchButton.tsx
│   │   │       └── OutputTerminal.tsx
│   │   ├── hooks/
│   │   │   ├── useTasks.ts
│   │   │   ├── useAgents.ts
│   │   │   └── useAgentStream.ts  # WebSocket hook
│   │   ├── lib/
│   │   │   ├── supabase.ts
│   │   │   └── orchestrator.ts    # Orchestrator API client
│   │   └── types/
│   └── public/
│       └── manifest.json
│
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql
        ├── 002_rls_policies.sql
        ├── 003_triggers.sql
        └── 004_agent_sessions.sql
```

## Environment Variables

```
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_KEY=xxxxx  # MCP server only

# Orchestrator
ORCHESTRATOR_API_KEY=xxxxx              # Secret key for API auth
ORCHESTRATOR_HOST=100.x.x.x             # Tailscale IP (not 0.0.0.0!)
ORCHESTRATOR_PORT=8080
CLAUDE_PATH=/usr/local/bin/claude       # Path to Claude CLI

# Web UI
VITE_APP_TITLE=Agent Task Planner
VITE_ORCHESTRATOR_URL=http://100.x.x.x:8080  # Tailscale IP
```

## Tailscale Setup

### Initial Configuration

```bash
# Install Tailscale on home machine (macOS)
brew install tailscale
sudo tailscaled &
tailscale up

# Install on iPhone
# Download Tailscale from App Store, sign in with same account

# Get your Tailscale IP
tailscale ip -4
# Example output: 100.64.0.1
```

### Security Best Practices

1. **Use Tailscale ACLs** to restrict which devices can access the orchestrator
2. **Enable MagicDNS** for friendly hostnames (e.g., `home-machine.tail1234.ts.net`)
3. **Never expose orchestrator to 0.0.0.0** - always bind to Tailscale IP only
4. **Rotate API keys** periodically

### Example ACL (tailscale admin console)

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:mobile"],
      "dst": ["tag:homelab:8080"]
    }
  ],
  "tagOwners": {
    "tag:mobile": ["your-email@example.com"],
    "tag:homelab": ["your-email@example.com"]
  }
}
```

## Open Questions

1. **Auth:** Do we need login? Or is obscurity (private Supabase URL) sufficient for solo use?
   - *Recommendation:* Start without auth, add later if needed. RLS policies are in place for future expansion.

2. **Git integration:** Should tasks link to specific repos/branches?
   - *Recommendation:* Add optional `repo_url` and `branch` fields to tasks in Phase 2.

3. **Agent assignment:** Simple round-robin or smarter matching based on task type?
   - *Recommendation:* Start with self-selection (agents claim from ready queue). Add affinity matching later based on task tags/categories.

4. **Notifications:** Any alerting when agents complete/fail tasks?
   - *Options:* Supabase webhooks → Slack/Discord, or polling from web UI with toast notifications.

5. **Retry Policy:** How many times should a failed task be retried? Manual vs automatic?
   - *Recommendation:* Manual retry initially (human reviews failure reason). Add `retry_count` and `max_retries` fields for automation later.

6. **Task Timeout:** Should in_progress tasks auto-fail after a duration?
   - *Recommendation:* Add `started_at` timestamp and a cleanup job that marks stale tasks (e.g., >4 hours) as failed.

7. **Agent Concurrency:** How many agents should run simultaneously?
   - *Recommendation:* Start with 1, configurable up to N. Consider RAM/CPU limits.

8. **Agent Prompting:** What initial prompt gets agents to work from the task queue?
   - *Recommendation:* Standard prompt template that instructs agent to claim → work → complete/fail loop.

9. **Persistent Sessions:** Should agents stay alive between tasks or spawn fresh each time?
   - *Recommendation:* Spawn fresh per task initially (cleaner state). Add persistent mode later for faster iteration.

## Notes

- Start simple, iterate based on actual usage
- MCP server is the critical path - agents need to read/write tasks
- Web UI can be ugly initially as long as capture works
- Mobile capture speed is key - must be faster than opening a text file
- Orchestrator enables true "lights-out" operation from anywhere
- Tailscale is the simplest secure remote access - no firewall/port forwarding needed
- Test orchestrator locally first before enabling Tailscale access
- Consider running orchestrator as a systemd/launchd service for persistence
