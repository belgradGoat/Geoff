# Geoff Documentation

A self-hosted tool for dispatching AI agents to work on your side projects while you're busy.

## The Idea

You're at work. You have an idea for your side project. You pull out your phone, create a task, and launch an AI agent to work on it. When you get home, the boring parts are done.

## Components

| Component | What It Does |
|-----------|--------------|
| **Web UI** | Mobile-friendly interface for tasks, files, and agents |
| **Orchestrator** | Runs on your Mac, launches Claude agents |
| **MCP Server** | Gives Claude agents access to task tools |
| **Supabase** | Stores tasks, syncs everywhere |

## How It Fits Together

```
Your Phone                         Your Mac (at home)
    │                                     │
    │ create task                         │
    ▼                                     │
┌─────────┐                               │
│ Web UI  │ ──── Tailscale ───────────────┤
└─────────┘                               │
    │                                     ▼
    │                             ┌──────────────┐
    │                             │ Orchestrator │
    │                             └──────┬───────┘
    │                                    │
    │                                    ▼
    │                             ┌──────────────┐
    │                             │ Claude Agent │
    │                             └──────┬───────┘
    │                                    │
    │                                    ▼
    │                             ┌──────────────┐
    ▼                             │  MCP Server  │
┌─────────┐                       └──────┬───────┘
│Supabase │◀──────────────────────────────┘
└─────────┘       (read/update tasks)
```

## Guides

- **[User Guide](userguide.md)** - Setup instructions, how to use each feature
- **[Developer Guide](developerguide.md)** - Contributing and technical details
- **[Architecture](architecture.md)** - Original design doc, data models, state machines

## Quick Setup

### Prerequisites

- Mac/Linux/Windows machine that stays on
- [Claude Code CLI](https://claude.ai/code)
- [Tailscale](https://tailscale.com) (free)
- [Supabase](https://supabase.com) account (free tier)

### Steps

1. **Clone the repo**
   ```bash
   git clone <repo-url>
   cd AgentTaskPlanner
   cp .env.example .env  # Edit with your Supabase credentials
   ```

2. **Set up Supabase**
   - Create a project at supabase.com
   - Copy `supabase/schema.sql` into the SQL Editor and run it
   - Copy credentials to `.env`

3. **Install MCP Server**
   ```bash
   cd mcp-server
   uv venv && source .venv/bin/activate
   uv pip install -e .
   ```

4. **Register MCP with Claude**
   ```bash
   claude mcp add-json --scope user agent-task-planner '{
     "type": "stdio",
     "command": "'$(pwd)'/.venv/bin/python",
     "args": ["-m", "agent_task_planner.server"],
     "env": {
       "SUPABASE_URL": "https://your-project.supabase.co",
       "SUPABASE_SERVICE_KEY": "your-service-key"
     }
   }'
   ```

5. **Start the orchestrator**
   ```bash
   cd ../orchestrator
   uv run uvicorn orchestrator.main:app --host 0.0.0.0 --port 8080
   ```

6. **Start the web UI**
   ```bash
   cd ../web
   npm install && npm run dev
   ```

7. **Connect via Tailscale**
   ```bash
   tailscale up
   # Access from phone: http://<tailscale-ip>:4011
   ```

## Task Flow

```
create → queued → ready → claimed → in_progress → done
                    ↑                     │
                    └──── retry if failed ┘
```

- **queued**: Waiting for dependencies
- **ready**: Available for an agent to claim
- **claimed/in_progress**: Agent is working on it
- **done**: Completed
- **failed**: Errored (auto-retries if configured)

## License

MIT
