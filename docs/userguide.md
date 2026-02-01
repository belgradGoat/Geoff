# User Guide

This guide covers how to use Agent Task Planner for managing tasks and orchestrating Claude agents.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Using the Web UI](#using-the-web-ui)
3. [Project Management](#project-management)
4. [Task Management](#task-management)
5. [Agent Orchestration](#agent-orchestration)
6. [Remote Access via Tailscale](#remote-access-via-tailscale)
7. [Using MCP Tools](#using-mcp-tools)
8. [Tips and Best Practices](#tips-and-best-practices)

---

## Getting Started

### Prerequisites

- A Supabase account with a project set up
- Node.js 18+ for the Web UI
- Python 3.10+ for MCP Server and Orchestrator
- Claude Code CLI (for agent launching)

### Initial Setup

1. **Configure Environment Variables**

   Copy the example files and fill in your credentials:
   ```bash
   cp .env.example .env
   cp web/.env.example web/.env
   ```

   Required variables:
   | Variable | Description |
   |----------|-------------|
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_ANON_KEY` | Public anon key for client access |
   | `SUPABASE_SERVICE_KEY` | Service key for MCP server (bypasses RLS) |
   | `ORCHESTRATOR_API_KEY` | Secret key for orchestrator API auth |

2. **Run Database Migrations**

   In your Supabase SQL Editor, run each migration file in order:
   - `001_initial_schema.sql` - Creates tables and indexes
   - `002_rls_policies.sql` - Sets up row-level security
   - `003_triggers.sql` - Adds automatic behaviors
   - `004_projects.sql` - Adds multi-project support

3. **Install the MCP Server**

   Create and activate a virtual environment, then install the MCP server:
   ```bash
   cd /path/to/AgentTaskPlanner
   python3 -m venv env
   source env/bin/activate
   cd mcp-server
   pip install -e .
   ```

4. **Add MCP Server to Claude Code**

   Use `--scope user` so the MCP server is available to ALL Claude instances (including agents spawned by the orchestrator):

   ```bash
   claude mcp add-json --scope user agent-task-planner '{
     "type": "stdio",
     "command": "/path/to/AgentTaskPlanner/env/bin/python",
     "args": ["-m", "agent_task_planner.server"],
     "env": {
       "SUPABASE_URL": "https://your-project.supabase.co",
       "SUPABASE_SERVICE_KEY": "your-service-key-here"
     }
   }'
   ```

   **Important notes:**
   - Replace `/path/to/AgentTaskPlanner` with your actual project path
   - Use the **full absolute path** to your virtual environment's Python
   - The `--scope user` flag is critical for orchestrator-spawned agents to access the MCP tools

   Verify the server is connected:
   ```bash
   claude mcp list
   ```

   You should see:
   ```
   agent-task-planner: /path/to/.../env/bin/python -m agent_task_planner.server - ✓ Connected
   ```

   Inside Claude Code, use `/mcp` to check server status.

5. **Start the Services**

   Terminal 1 (Web UI):
   ```bash
   cd web && npm run dev
   ```

   Terminal 2 (Orchestrator):
   ```bash
   cd orchestrator && python -m orchestrator.main
   ```

---

## Using the Web UI

### Task List View

The main view shows tasks grouped by status:

| Status | Color | Meaning |
|--------|-------|---------|
| In Progress | Yellow | An agent is actively working on this |
| Assigned | Purple | Claimed by an agent but not started |
| Ready | Blue | Available to be claimed |
| Queued | Gray | Waiting for dependencies |
| Blocked | Orange | Manually blocked |
| Done | Green | Completed successfully |
| Failed | Red | Failed after max retries |

Tasks are sorted by priority (highest first) within each group.

### Project Selector

Use the project selector dropdown at the top of the page to:

1. **Filter tasks by project**: Only see tasks for the selected project
2. **Set context for new agents**: Agents launched will work in the project's directory
3. **Create new projects**: Click "New Project" to add a project

When no project is selected, all tasks are shown and agents require a manual working directory.

### Quick Add

Use the form at the top to rapidly create tasks:

1. Enter a task title
2. Select priority (Normal, Low, Medium, High, Urgent)
3. Click "Add Task"

The task is created with status `ready` and appears immediately.

### Task Details

Click any task to view and edit details:

- **Title**: Brief description of what needs to be done
- **Description**: Full details, context, acceptance criteria
- **Status**: Current state (can be changed manually)
- **Priority**: 0-4 (higher = more important)
- **Complexity**: trivial, small, medium, large, unknown
- **Progress**: 0-100% (updated by agents)
- **Assigned Agent**: ID of the agent working on it
- **Result/Error**: Outcome information

---

## Project Management

Projects allow you to organize tasks and agents by codebase or work area.

### Creating Projects

**Via Web UI:**
1. Click the project dropdown at the top
2. Click "New Project"
3. Enter project name and file path
4. Click "Create"

**Via MCP Tools:**
```
project_create(name="My App", path="/Users/me/projects/my-app", description="Main application")
```

**Via Folder Scan:**
```
project_scan(base_path="/Users/me/projects")
```
This scans a directory and creates projects for each subdirectory that looks like a code project (has package.json, pyproject.toml, Cargo.toml, etc.).

### Project Fields

| Field | Description |
|-------|-------------|
| `name` | Display name for the project |
| `path` | Absolute filesystem path to the project root |
| `description` | Optional notes about the project |
| `is_active` | Whether the project is shown in selectors |
| `settings` | JSON object for custom project settings |

### Filtering by Project

When a project is selected:
- **Task list**: Only shows tasks linked to that project
- **Quick Add**: New tasks are automatically linked to the project
- **Agent Panel**: Agents launch in the project's directory

### Linking Tasks to Projects

Tasks are linked to projects via `project_id`:

```
task_create(
    title="Add login page",
    project_id="uuid-of-project",
    ...
)
```

Tasks without a `project_id` are "global" and appear when no project filter is applied.

---

## Task Management

### Task States

| State | Description | Who Changes It |
|-------|-------------|----------------|
| `queued` | Has unmet dependencies | System (auto) |
| `ready` | Available for agents | System/User |
| `assigned` | Claimed by an agent | Agent (via claim) |
| `in_progress` | Work has started | Agent (via update) |
| `done` | Successfully completed | Agent (via complete) |
| `failed` | Failed permanently | Agent/System |
| `blocked` | Manually blocked | User |

### Dependencies

Tasks can depend on other tasks:

1. Create the prerequisite task first
2. When creating the dependent task, specify `depends_on` with the prerequisite task ID
3. The dependent task starts as `queued`
4. When all dependencies are `done`, it auto-promotes to `ready`

### Priority System

| Priority | Label | Use Case |
|----------|-------|----------|
| 0 | Normal | Regular tasks |
| 1 | Low | Nice-to-have, not urgent |
| 2 | Medium | Important but not critical |
| 3 | High | Should be done soon |
| 4 | Urgent | Do immediately |

Agents should generally claim higher priority tasks first.

### Complexity Estimates

| Complexity | Typical Duration | Example |
|------------|------------------|---------|
| `trivial` | < 5 min | Fix a typo |
| `small` | 5-30 min | Add a simple function |
| `medium` | 30 min - 2 hrs | Implement a feature |
| `large` | 2+ hrs | Major refactoring |
| `unknown` | Needs investigation | New technology |

---

## Agent Orchestration

### Prerequisites

Before launching agents, ensure:
1. The MCP server is configured with `--scope user` (see step 4 in Getting Started)
2. The Orchestrator is running: `cd orchestrator && python -m orchestrator.main`
3. The Web UI is running: `cd web && npm run dev`

### Launching Agents from Web UI

From the Web UI's Agent Panel (http://localhost:4011):

1. **Select a project** from the dropdown (or leave unselected for manual directory)
2. Enter a prompt describing what the agent should do
3. If no project selected, specify a working directory
4. Click "Launch Agent"

When a project is selected, the agent automatically runs in that project's directory. The agent starts in a subprocess and you can watch its output in real-time.

### Example Prompts for Task-Working Agents

**Check and work on tasks:**
```
Use the task_get_ready tool to find available tasks. Claim the highest priority one using task_claim, then complete the work and mark it done with task_complete.
```

**Process all ready tasks:**
```
List all ready tasks with task_get_ready. For each task, claim it, perform the work described in the title/description, and mark it complete. Continue until no ready tasks remain.
```

**Work on a specific task:**
```
Get task details for ID "abc-123" using task_get. If it's ready, claim it and complete the described work.
```

### Launching Agents via API

You can also launch agents programmatically:

```bash
curl -X POST http://localhost:8080/api/agents \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{
    "prompt": "Use task_get_ready to find tasks and work on the highest priority one.",
    "working_dir": "/path/to/project"
  }'
```

### How Agent-Task Integration Works

1. **Agent spawns** → Orchestrator runs `claude -p "prompt" --dangerously-skip-permissions`
2. **Agent connects to MCP** → Because MCP is configured with user scope, the agent has access to task tools
3. **Agent uses task tools** → `task_get_ready`, `task_claim`, `task_update_progress`, `task_complete`
4. **Task updates sync** → Changes appear in real-time in the Web UI via Supabase subscriptions

### Agent Lifecycle

```
Starting → Running → Stopped/Failed
```

- **Starting**: Process is spawning
- **Running**: Agent is executing
- **Stopped**: Completed normally (exit code 0)
- **Failed**: Exited with error

### Stopping Agents

Click the "Stop" button on any running agent to terminate it gracefully.

### Output Streaming

When you select an agent, its output streams live via WebSocket. You'll see:
- Agent's thinking and actions
- Tool calls and results
- Final outcome

---

## Remote Access via Tailscale

Tailscale allows you to securely access the orchestrator and web UI from anywhere (phone, laptop, etc.) without exposing ports to the public internet.

### Setup

1. **Install Tailscale** on your Mac:
   ```bash
   brew install tailscale
   sudo tailscaled
   tailscale up
   ```

2. **Get your Tailscale IP**:
   ```bash
   tailscale ip -4
   ```
   This gives you an IP like `100.x.y.z`

3. **Configure the Orchestrator**:

   In your `.env` file:
   ```
   TAILSCALE_IP=100.x.y.z
   ORCHESTRATOR_HOST=0.0.0.0
   ORCHESTRATOR_PORT=8080
   ```

4. **Configure the Web UI**:

   In `web/.env`:
   ```
   VITE_ORCHESTRATOR_URL=http://100.x.y.z:8080
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

5. **Access from another device**:

   Install Tailscale on your phone or other computer, join the same Tailnet, then:
   - Web UI: `http://100.x.y.z:4011`
   - Orchestrator API: `http://100.x.y.z:8080`

### Security Notes

- **Tailscale encryption**: All traffic is encrypted end-to-end
- **No public exposure**: Ports are only accessible within your Tailnet
- **API key required**: The orchestrator still requires `X-API-Key` header
- **Supabase RLS**: Database access is protected by row-level security

### Mobile Workflow Example

1. Open Safari on iPhone
2. Go to `http://100.x.y.z:4011`
3. Select a project
4. Enter a prompt: "Fix the bug in the login form"
5. Click "Launch Agent"
6. Watch the agent work in real-time

The agent runs on your Mac, but you control it from anywhere.

---

## Using MCP Tools

When working in Claude Code with the MCP server configured, these tools are available:

### Viewing Tasks

```
task_list(status="ready", project_id="uuid", limit=10)
```
List tasks with optional filters. Use `project_id` to filter by project.

```
task_get(task_id="uuid-here")
```
Get full details including logs and subtasks.

```
task_get_ready(project_id="uuid", limit=5)
```
Get tasks ready to be claimed, ordered by priority. Filter by project if specified.

### Working on Tasks

```
task_claim(task_id="uuid", agent_id="my-agent-id")
```
Atomically claim a ready task. Fails if already claimed.

```
task_update_progress(task_id="uuid", agent_id="my-agent-id", progress=50, note="Halfway done")
```
Update progress and optionally add a note.

```
task_complete(task_id="uuid", agent_id="my-agent-id", result="Implemented the feature")
```
Mark task as done with optional result description.

```
task_fail(task_id="uuid", agent_id="my-agent-id", error_message="Could not find file", retry=True)
```
Mark task as failed. If `retry=True` and retries remain, re-queues as ready.

### Creating Tasks

```
task_create(
    title="Implement login",
    description="Add OAuth login with Google",
    project_id="uuid-of-project",
    priority=3,
    complexity="medium",
    depends_on=["prerequisite-uuid"],
    tags=["auth", "frontend"]
)
```

```
task_add_subtask(
    parent_id="uuid",
    title="Create login button component",
    priority=2
)
```

### Adding Notes

```
task_add_note(task_id="uuid", agent_id="my-agent-id", note="Found a potential issue with the API")
```

### Project Tools

```
project_list(active_only=True)
```
List all active projects.

```
project_get(project_id="uuid")
```
Get project details.

```
project_create(name="My App", path="/path/to/app", description="Optional description")
```
Create a new project.

```
project_update(project_id="uuid", name="New Name", is_active=False)
```
Update project details.

```
project_scan(base_path="/Users/me/projects")
```
Scan a folder and create projects for each recognized codebase.

---

## Tips and Best Practices

### For Task Creation

1. **Be specific**: Write clear, actionable titles
2. **Include context**: Add relevant details in the description
3. **Set realistic complexity**: Helps with planning
4. **Use dependencies**: Break large work into ordered subtasks
5. **Tag appropriately**: Makes filtering easier

### For Agent Workflows

1. **Claim before working**: Always claim a task before starting work
2. **Update progress**: Report progress for long-running tasks
3. **Add notes**: Document discoveries and decisions
4. **Handle failures gracefully**: Provide clear error messages
5. **Complete with results**: Summarize what was accomplished

### For Remote Orchestration

1. **Use Tailscale**: Secure access to orchestrator from anywhere
2. **Set strong API keys**: Protect the orchestrator endpoint
3. **Monitor agent output**: Watch for issues in real-time
4. **Set timeouts**: Prevent runaway agents

### Workflow Example

1. Create high-level task: "Build user authentication"
2. Add subtasks: "Set up OAuth", "Create login page", "Add session handling"
3. Set dependencies between subtasks
4. Agent claims "Set up OAuth" (no dependencies)
5. Agent completes it, "Create login page" auto-promotes to ready
6. Next agent claims "Create login page"
7. Continue until parent task can be marked complete
