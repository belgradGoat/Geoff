# Agent Task Planner

A complete task management system designed for AI agent orchestration. This system enables you to create, manage, and assign tasks to Claude agents, with real-time progress tracking and remote agent launching capabilities.

## Overview

Agent Task Planner consists of three main components:

| Component | Description | Technology |
|-----------|-------------|------------|
| **MCP Server** | Exposes task management tools to Claude agents | Python, FastMCP, Supabase |
| **Web UI** | Browser-based interface for task capture and monitoring | React, TypeScript, Tailwind |
| **Orchestrator** | Remote agent launcher with live output streaming | FastAPI, WebSockets |

## Key Features

- **Task Queue Management**: Create tasks with priorities, dependencies, and complexity estimates
- **Agent Integration**: Claude agents can claim, update, and complete tasks via MCP tools
- **Real-time Sync**: Live updates across all clients via Supabase subscriptions
- **Remote Agent Launch**: Start Claude agents on remote machines via Tailscale
- **Output Streaming**: Watch agent output in real-time via WebSocket
- **Automatic Retries**: Failed tasks automatically re-queue with configurable retry limits
- **Dependency Tracking**: Tasks with dependencies auto-promote when predecessors complete

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Web UI       │────▶│    Supabase     │◀────│   MCP Server    │
│   (Browser)     │     │   (Database)    │     │  (Claude Tool)  │
│                 │     │                 │     │                 │
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │
         │ HTTP/WS
         ▼
┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │
│  Orchestrator   │────▶│  Claude Agent   │
│   (FastAPI)     │     │   (CLI Process) │
│                 │     │                 │
└─────────────────┘     └─────────────────┘
```

## Quick Start

### 1. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_triggers.sql`
3. Copy your credentials to `.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-key
   ```

### 2. Install Components

**MCP Server (use a virtual environment):**
```bash
cd /path/to/AgentTaskPlanner
python3 -m venv env
source env/bin/activate
cd mcp-server
pip install -e .
```

**Web UI:**
```bash
cd web
cp .env.example .env  # Edit with your credentials
npm install
npm run dev
```

**Orchestrator:**
```bash
cd orchestrator
pip install -e .
python -m orchestrator.main
```

### 3. Configure Claude Code

Register the MCP server with **user scope** (required for orchestrator-spawned agents):

```bash
claude mcp add-json --scope user agent-task-planner '{
  "type": "stdio",
  "command": "/path/to/AgentTaskPlanner/env/bin/python",
  "args": ["-m", "agent_task_planner.server"],
  "env": {
    "SUPABASE_URL": "https://your-project.supabase.co",
    "SUPABASE_SERVICE_KEY": "your-service-key"
  }
}'
```

**Important**: Use the full absolute path to your venv Python.

Verify the connection:
```bash
claude mcp list
# Should show: agent-task-planner: ... ✓ Connected
```

### 4. Launch an Agent

Start orchestrator and web UI, then from the Agent Panel:
```
Use task_get_ready to find available tasks. Claim the highest priority one and complete it.
```

## Documentation

- [User Guide](userguide.md) - How to use the system
- [Developer Guide](developerguide.md) - Architecture and technical details

## Task Lifecycle

```
┌──────────┐    deps met    ┌───────┐    claimed    ┌──────────┐
│  queued  │ ─────────────▶ │ ready │ ────────────▶ │ assigned │
└──────────┘                └───────┘               └────┬─────┘
                                                         │
                                                    start work
                                                         │
                                                         ▼
┌──────────┐    success     ┌─────────────┐         ┌────────┐
│   done   │ ◀───────────── │ in_progress │ ───────▶│ failed │
└──────────┘                └─────────────┘  error  └───┬────┘
                                                        │
                                                   retry if < max
                                                        │
                                                        ▼
                                                   ┌───────┐
                                                   │ ready │
                                                   └───────┘
```

## License

MIT
