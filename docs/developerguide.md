# Developer Guide

This guide covers the architecture, technical implementation, and extension points of Agent Task Planner.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [MCP Server](#mcp-server)
4. [Orchestrator](#orchestrator)
5. [Web UI](#web-ui)
6. [Security](#security)
7. [Extending the System](#extending-the-system)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
├─────────────────┬───────────────────┬───────────────────────────┤
│    Web UI       │   Claude Code     │   Mobile (Future)         │
│    (React)      │   (MCP Client)    │                           │
└────────┬────────┴─────────┬─────────┴───────────────────────────┘
         │                  │
         │ HTTP/WS          │ MCP Protocol
         ▼                  ▼
┌─────────────────┐  ┌─────────────────┐
│  Orchestrator   │  │   MCP Server    │
│   (FastAPI)     │  │   (FastMCP)     │
└────────┬────────┘  └────────┬────────┘
         │                    │
         │                    │ Supabase Client
         ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Supabase                                  │
├─────────────────┬───────────────────┬───────────────────────────┤
│   PostgreSQL    │   Realtime        │   Auth (Future)           │
│   (Data Store)  │   (Subscriptions) │                           │
└─────────────────┴───────────────────┴───────────────────────────┘
```

### Data Flow

1. **Task Creation**: Web UI → Supabase → Realtime broadcast
2. **Task Claim**: MCP Tool → Supabase (atomic update)
3. **Progress Update**: MCP Tool → Supabase → Realtime → Web UI
4. **Agent Launch**: Web UI → Orchestrator → Claude CLI subprocess
5. **Output Stream**: Claude subprocess → Orchestrator → WebSocket → Web UI

---

## Database Schema

### Tables

#### `tasks`

Primary table for task management.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `title` | TEXT | Task title (required) |
| `description` | TEXT | Detailed description |
| `status` | task_status | Current state |
| `complexity` | task_complexity | Estimated complexity |
| `priority` | INTEGER | Priority level (0-4) |
| `parent_id` | UUID | Parent task for subtasks |
| `project_id` | UUID | Associated project (FK to projects) |
| `depends_on` | UUID[] | Array of dependency task IDs |
| `assigned_agent` | TEXT | Agent ID if claimed |
| `progress` | INTEGER | 0-100 completion percentage |
| `result` | TEXT | Success result message |
| `error_message` | TEXT | Failure error message |
| `retry_count` | INTEGER | Current retry attempt |
| `max_retries` | INTEGER | Maximum retry attempts |
| `context` | JSONB | Arbitrary context data |
| `tags` | TEXT[] | Categorization tags |
| `attachments` | JSONB | File attachments (base64 encoded) |
| `estimated_minutes` | INTEGER | Estimated time |
| `actual_minutes` | INTEGER | Actual time (auto-calculated) |
| `started_at` | TIMESTAMPTZ | When work began |
| `completed_at` | TIMESTAMPTZ | When completed/failed |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

#### `projects`

Project definitions for multi-project support.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Project display name |
| `path` | TEXT | Filesystem path (unique) |
| `description` | TEXT | Optional description |
| `is_active` | BOOLEAN | Show in project selectors |
| `settings` | JSONB | Custom project settings |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

#### `task_logs`

Audit trail for task events.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `task_id` | UUID | Foreign key to tasks |
| `event_type` | log_event_type | Type of event |
| `message` | TEXT | Event description |
| `old_status` | task_status | Previous status |
| `new_status` | task_status | New status |
| `agent_id` | TEXT | Agent that triggered event |
| `metadata` | JSONB | Additional event data |
| `created_at` | TIMESTAMPTZ | Event timestamp |

### Enums

```sql
CREATE TYPE task_status AS ENUM (
    'queued',      -- Waiting for dependencies
    'ready',       -- Available for claiming
    'assigned',    -- Claimed by an agent
    'in_progress', -- Work in progress
    'done',        -- Successfully completed
    'failed',      -- Failed permanently
    'blocked'      -- Manually blocked
);

CREATE TYPE task_complexity AS ENUM (
    'trivial', 'small', 'medium', 'large', 'unknown'
);

CREATE TYPE log_event_type AS ENUM (
    'created', 'status_change', 'note', 'error', 'completed', 'failed'
);
```

### Triggers

#### `update_updated_at`
Automatically sets `updated_at` on every update.

#### `log_task_status_change`
Creates a log entry whenever status changes.

#### `log_task_creation`
Creates a log entry when a task is created.

#### `check_and_promote_queued_tasks`
When a task is marked `done`, checks all `queued` tasks that depend on it. If all dependencies are now `done`, promotes them to `ready`.

#### `set_task_timestamps`
- Sets `started_at` when status changes to `in_progress`
- Sets `completed_at` when status changes to `done` or `failed`
- Calculates `actual_minutes` from the difference

### Indexes

```sql
-- Tasks
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_assigned_agent ON tasks(assigned_agent);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_has_attachments ON tasks ((attachments != '[]'::jsonb));

-- Task logs
CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
CREATE INDEX idx_task_logs_created_at ON task_logs(created_at DESC);

-- Projects
CREATE INDEX idx_projects_is_active ON projects(is_active);
CREATE INDEX idx_projects_path ON projects(path);
```

---

## MCP Server

### Technology Stack

- **FastMCP**: MCP server framework
- **Supabase Python Client**: Database access
- **python-dotenv**: Environment configuration

### Project Structure

```
mcp-server/
├── pyproject.toml
└── src/agent_task_planner/
    ├── __init__.py
    ├── db.py          # Supabase client singleton
    ├── tools.py       # Tool implementations
    └── server.py      # FastMCP server definition
```

### Tool Registration

Tools are registered using the `@mcp.tool()` decorator:

```python
from fastmcp import FastMCP

mcp = FastMCP("Agent Task Planner")

@mcp.tool()
def task_list(status: Optional[str] = None, limit: int = 50) -> dict:
    """List tasks with optional filters."""
    # Implementation
```

### Atomic Operations

The `claim_task` operation uses conditional updates for atomicity:

```python
result = (
    db.table("tasks")
    .update({"status": "assigned", "assigned_agent": agent_id})
    .eq("id", task_id)
    .eq("status", "ready")           # Only if still ready
    .is_("assigned_agent", "null")   # Only if not claimed
    .execute()
)
```

If no rows are updated, the claim failed (task was already claimed or not ready).

### Running the Server

```bash
cd mcp-server
uv venv && source .venv/bin/activate
uv pip install -e .
python -m agent_task_planner.server
```

Or via the entry point:
```bash
agent-task-planner
```

### Configuring Claude Code

The MCP server must be registered with Claude Code CLI. **Use `--scope user`** so that agents spawned by the orchestrator can also access the MCP tools:

```bash
# Run from the project root directory
claude mcp add-json --scope user agent-task-planner '{
  "type": "stdio",
  "command": "'$(pwd)'/mcp-server/.venv/bin/python",
  "args": ["-m", "agent_task_planner.server"],
  "env": {
    "SUPABASE_URL": "https://your-project.supabase.co",
    "SUPABASE_SERVICE_KEY": "your-service-key"
  }
}'
```

**Critical requirements:**

1. **Absolute Python path**: Use the full path to the Python executable in your virtual environment. The `$(pwd)` shell expansion works when running from the project root.

2. **User scope**: The `--scope user` flag is essential for the orchestrator workflow. When the orchestrator spawns a Claude agent, that agent needs access to the MCP tools. User-scoped MCP servers are available to all Claude instances on the machine.

To verify your Python path:
```bash
cd mcp-server && source .venv/bin/activate && which python
# Use this output as the "command" value
```

#### MCP Server Management Commands

```bash
# List all configured servers and their status
claude mcp list

# Get details for a specific server
claude mcp get agent-task-planner

# Remove a server
claude mcp remove agent-task-planner

# Check status inside Claude Code
/mcp
```

#### Configuration Storage

MCP configurations are stored in `~/.claude.json`. User-scoped servers appear in the top-level `mcpServers` object:

```json
{
  "mcpServers": {
    "agent-task-planner": {
      "type": "stdio",
      "command": "/path/to/AgentTaskPlanner/mcp-server/.venv/bin/python",
      "args": ["-m", "agent_task_planner.server"],
      "env": {
        "SUPABASE_URL": "...",
        "SUPABASE_SERVICE_KEY": "..."
      }
    }
  }
}
```

#### Scopes

| Scope | Flag | Use Case |
|-------|------|----------|
| Local | `--scope local` (default) | Personal development, single project |
| Project | `--scope project` | Team sharing via `.mcp.json` |
| **User** | `--scope user` | **Required for orchestrator** - available to all Claude instances |

**For Agent Task Planner, always use `--scope user`** to ensure spawned agents can access task management tools.

---

## Orchestrator

### Technology Stack

- **FastAPI**: Async web framework
- **Uvicorn**: ASGI server
- **Pydantic**: Request/response validation
- **asyncio**: Subprocess management

### Project Structure

```
orchestrator/
├── pyproject.toml
└── src/orchestrator/
    ├── __init__.py
    ├── main.py              # FastAPI app entry
    ├── api/
    │   ├── agents.py        # REST endpoints
    │   └── websocket.py     # WebSocket streaming
    └── core/
        ├── config.py        # Settings management
        ├── security.py      # API key middleware
        ├── providers.py     # Multi-provider abstraction
        └── agent_manager.py # Process management
```

### Provider Abstraction

The orchestrator supports multiple AI CLI tools through a provider abstraction layer:

| Provider | CLI Tool | Free Tier |
|----------|----------|-----------|
| `claude` | Claude Code CLI | Yes |
| `codex` | OpenAI Codex CLI | Yes |
| `gemini` | Google Gemini CLI | Yes |
| `opencode` | OpenCode | Yes |

Each provider implements the `Provider` interface with a `build_command()` method that constructs the appropriate CLI invocation:

```python
class Provider(ABC):
    @abstractmethod
    def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
        pass

class ClaudeProvider(Provider):
    def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
        return [self.config.command, "-p", prompt, "--dangerously-skip-permissions"]
```

### Agent Manager

The `AgentManager` class handles:

1. **Process Spawning**: Uses `asyncio.create_subprocess_exec`
2. **Output Capture**: Reads stdout/stderr asynchronously
3. **Subscriber Pattern**: Multiple WebSocket clients can watch the same agent
4. **Lifecycle Management**: Tracks status, PID, exit codes
5. **Provider Support**: Uses provider registry to build correct CLI commands

```python
# Get provider from registry
registry = get_provider_registry()
provider = registry.get_provider(ProviderType(agent.provider))

# Build command using provider abstraction
cmd = provider.build_command(agent.prompt, agent.working_dir)

process = await asyncio.create_subprocess_exec(
    *cmd,
    cwd=working_dir,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.STDOUT,
)
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents` | Launch new agent (accepts `provider` field) |
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/:id` | Get agent details |
| DELETE | `/api/agents/:id` | Stop agent |
| GET | `/api/agents/:id/output` | Get buffered output |
| WS | `/api/agents/:id/stream` | Live output stream |
| GET | `/api/agents/providers` | List available providers |

### WebSocket Protocol

Messages are JSON objects:

```typescript
// Output line
{ "type": "output", "data": "Agent output text..." }

// Heartbeat (every 30s)
{ "type": "heartbeat" }

// Stream ended
{ "type": "done", "status": "stopped", "exit_code": 0 }
```

### Authentication

API key is required in the `X-API-Key` header for REST endpoints and as a query parameter for WebSocket:

```
GET /api/agents
X-API-Key: your-secret-key

WS /api/agents/:id/stream?api_key=your-secret-key
```

### Provider Configuration

Providers are configured via environment variables:

```bash
# Default provider when none specified
ORCHESTRATOR_DEFAULT_PROVIDER=claude

# Custom CLI paths (if not in PATH)
ORCHESTRATOR_CLAUDE_COMMAND=claude
ORCHESTRATOR_CODEX_COMMAND=codex
ORCHESTRATOR_GEMINI_COMMAND=gemini
ORCHESTRATOR_OPENCODE_COMMAND=opencode
```

The web UI stores the user's provider preference in `localStorage` under `geoff-provider`. When launching an agent without specifying a provider, this preference is used.

---

## Web UI

### Technology Stack

- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **Zustand**: State management
- **Supabase JS Client**: Database + realtime

### Project Structure

```
web/
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── public/
│   ├── logo.png            # Geoff mascot logo
│   ├── favicon.ico         # Browser favicon
│   └── apple-touch-icon.png
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── lib/
    │   ├── supabase.ts      # Client + types
    │   └── orchestrator.ts  # API client (+ provider types)
    ├── hooks/
    │   ├── useTasks.ts      # Task state
    │   ├── useAgents.ts     # Agent state (provider-aware)
    │   └── useProjects.ts   # Project state
    └── components/
        ├── tasks/
        │   ├── QuickAdd.tsx
        │   ├── TaskList.tsx
        │   └── TaskDetail.tsx
        ├── agents/
        │   └── AgentPanel.tsx
        ├── files/
        │   └── FileBrowser.tsx
        ├── projects/
        │   └── ProjectSelector.tsx
        └── settings/
            ├── ProviderSettings.tsx  # AI provider selector
            └── RemoteAccess.tsx
```

### State Management

Zustand stores manage application state:

```typescript
export const useTasks = create<TasksState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,

  fetchTasks: async () => {
    set({ loading: true });
    const { data } = await supabase.from('tasks').select('*');
    set({ tasks: data, loading: false });
  },

  // ... other actions
}));
```

### Realtime Subscriptions

The UI subscribes to Supabase realtime for live updates:

```typescript
const channel = supabase
  .channel('tasks-changes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'tasks' },
    (payload) => {
      // Handle INSERT, UPDATE, DELETE
    }
  )
  .subscribe();
```

### Environment Variables

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ORCHESTRATOR_URL=http://localhost:8080
VITE_ORCHESTRATOR_API_KEY=secret
```

---

## Security

### Database Security

- **Row Level Security (RLS)**: Enabled on all tables
- **Policies**: Currently allow all operations (customize for production)
- **Service Key**: MCP server uses service key to bypass RLS

### API Security

- **API Key Auth**: Orchestrator requires `X-API-Key` header
- **CORS**: Configured in FastAPI middleware
- **No Auth Tokens in URLs**: Except WebSocket (use query param)

### Production Recommendations

1. **Restrict RLS policies** to authenticated users
2. **Use Supabase Auth** for user management
3. **Rotate API keys** regularly
4. **Use HTTPS** for all connections
5. **Limit orchestrator access** via firewall/Tailscale

---

## Extending the System

### Adding New Task Fields

1. Add column to `supabase/schema.sql` and run in Supabase SQL Editor:
   ```sql
   ALTER TABLE tasks ADD COLUMN my_field TEXT;
   ```

2. Update TypeScript types in `web/src/lib/supabase.ts`

3. Add to MCP tools in `mcp-server/src/agent_task_planner/tools.py`

4. Update UI components as needed

### Adding New MCP Tools

1. Implement function in `tools.py`:
   ```python
   def my_new_tool(param: str) -> dict:
       """Tool description."""
       # Implementation
       return {"success": True}
   ```

2. Register in `server.py`:
   ```python
   @mcp.tool()
   def my_new_tool(param: str) -> dict:
       """Tool description for Claude."""
       return tools.my_new_tool(param)
   ```

### Adding Orchestrator Endpoints

1. Create new router or add to `api/agents.py`:
   ```python
   @router.post("/custom")
   async def custom_endpoint(
       request: CustomRequest,
       _: str = Depends(verify_api_key),
   ):
       # Implementation
   ```

2. Include router in `main.py` if new file

### Adding a New AI Provider

1. Add the provider type to `ProviderType` enum in `providers.py`:
   ```python
   class ProviderType(str, Enum):
       CLAUDE = "claude"
       # Add your provider:
       NEWPROVIDER = "newprovider"
   ```

2. Create a provider class:
   ```python
   class NewProviderProvider(Provider):
       def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
           cmd = [self.config.command]
           cmd.extend([self.config.prompt_flag, prompt])
           if self.config.auto_approve_flag:
               cmd.append(self.config.auto_approve_flag)
           return cmd
   ```

3. Register in the provider registry:
   ```python
   def get_provider_registry() -> ProviderRegistry:
       registry = ProviderRegistry()
       registry.register(ProviderType.NEWPROVIDER, NewProviderProvider(
           ProviderConfig(
               name="New Provider",
               command="newprovider",
               prompt_flag="--prompt",
               auto_approve_flag="--yes",
           )
       ))
       return registry
   ```

4. Add environment variable in `config.py`:
   ```python
   newprovider_command: str = os.getenv("ORCHESTRATOR_NEWPROVIDER_COMMAND", "newprovider")
   ```

5. Update the `get_provider_command()` method

6. Add to `ProviderSettings.tsx` in the web UI

---

## Troubleshooting

### MCP Server Won't Start

1. Check `.env` file exists and has valid credentials
2. Verify Supabase project is accessible
3. Check Python dependencies: `cd mcp-server && uv pip install -e .`

### Tasks Not Syncing

1. Verify Supabase realtime is enabled for the table
2. Check browser console for WebSocket errors
3. Ensure RLS policies allow the operation

### Agent Launch Fails

1. Verify the provider CLI is installed and in PATH:
   - Claude: `claude --version`
   - Codex: `codex --version`
   - Gemini: `gemini --version`
   - OpenCode: `opencode --version`
2. Check orchestrator logs for subprocess errors
3. Verify working directory exists and is accessible
4. Check if custom CLI path is needed in `.env`:
   ```bash
   ORCHESTRATOR_CLAUDE_COMMAND=/path/to/claude
   ```

### WebSocket Connection Issues

1. Check API key is correct in query parameter
2. Verify orchestrator is running and accessible
3. Check for CORS issues in browser console

### Database Migration Errors

1. Run the complete `supabase/schema.sql` file in Supabase SQL Editor
2. Check for existing objects that conflict (drop them first if re-running)
3. Use `DROP TYPE IF EXISTS` for enum changes

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Task not found or not assigned to this agent" | Trying to update task not claimed | Claim task first |
| "Maximum number of agents reached" | Too many concurrent agents | Stop unused agents |
| "Missing SUPABASE_URL" | Environment not configured | Check .env file |
| "Invalid API key" | Wrong orchestrator key | Check ORCHESTRATOR_API_KEY |
| "Unknown provider: xyz" | Provider not registered | Use claude, codex, gemini, or opencode |
| "Provider CLI not found" | CLI tool not in PATH | Install the CLI or set custom path in .env |
