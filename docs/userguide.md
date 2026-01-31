# User Guide

This guide covers how to use Agent Task Planner for managing tasks and orchestrating Claude agents.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Using the Web UI](#using-the-web-ui)
3. [Task Management](#task-management)
4. [Agent Orchestration](#agent-orchestration)
5. [Using MCP Tools](#using-mcp-tools)
6. [Tips and Best Practices](#tips-and-best-practices)

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

3. **Start the Services**

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

### Launching Agents

From the Web UI's Agent Panel:

1. Enter a prompt describing what the agent should do
2. Optionally specify a working directory
3. Click "Launch Agent"

The agent starts in a subprocess and you can watch its output in real-time.

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

## Using MCP Tools

When working in Claude Code with the MCP server configured, these tools are available:

### Viewing Tasks

```
task_list(status="ready", limit=10)
```
List tasks with optional filters.

```
task_get(task_id="uuid-here")
```
Get full details including logs and subtasks.

```
task_get_ready(limit=5)
```
Get tasks ready to be claimed, ordered by priority.

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
