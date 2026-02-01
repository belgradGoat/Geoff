# Agent Task Planner MCP Server

MCP server exposing task management tools for Claude agents.

## Installation

```bash
pip install -e .
```

## Running

```bash
python -m agent_task_planner.server
```

Or via the entry point:

```bash
agent-task-planner
```

## Available Tools

- `task_list` - List tasks with filters
- `task_get` - Get task details
- `task_get_ready` - Get claimable tasks
- `task_claim` - Claim a task
- `task_update_progress` - Update progress
- `task_complete` - Mark task done
- `task_fail` - Mark task failed
- `task_create` - Create new task
- `task_add_subtask` - Add subtask
- `task_add_note` - Add note to task

## Configuration

Set environment variables or use `.env` file:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Service role key for database access
