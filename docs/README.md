# Geoff Documentation

A self-hosted tool for dispatching AI agents to work on your side projects while you're busy.

## The Idea

You're at work. You have an idea for your side project. You pull out your phone, create a task, and launch an AI agent to work on it. When you get home, the boring parts are done.

## Components

| Component | What It Does |
|-----------|--------------|
| **Web UI** | Mobile-friendly interface for tasks, files, agents, chat, and GitHub integration |
| **Orchestrator** | Runs on your Mac, launches AI agents (Claude, Codex, Gemini, OpenCode) |
| **MCP Server** | Gives AI agents access to task tools and GitHub linking |
| **Supabase** | Stores tasks, syncs everywhere |
| **GitHub Integration** | View repo status, branches, PRs, issues; link tasks to GitHub artifacts |

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
    │                             │   AI Agent   │
    │                             │ (Claude/Codex│
    │                             │ /Gemini/etc) │
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
- **[GitHub API Dev Plan](GithubApiDevPlan.md)** - GitHub integration design and implementation status

## Quick Setup

### Prerequisites

- Mac/Linux machine that stays on
- [Python 3.10+](https://python.org) and [uv](https://github.com/astral-sh/uv)
- [Node.js 18+](https://nodejs.org)
- At least one AI CLI tool:
  - [Claude Code CLI](https://claude.ai/code) (recommended)
  - [OpenAI Codex CLI](https://github.com/openai/codex)
  - [Google Gemini CLI](https://github.com/google-gemini/gemini-cli)
  - [OpenCode](https://github.com/opencode-ai/opencode)
- [Tailscale](https://tailscale.com) (free)
- [Supabase](https://supabase.com) account (free tier)
- [GitHub CLI](https://cli.github.com) (optional, for GitHub integration)

### Automated Setup (Recommended)

```bash
# 1. Clone and run the setup wizard
git clone <repo-url>
cd Geoff
./setup.sh

# 2. Set up database (one-time)
#    Go to Supabase → SQL Editor → paste supabase/schema.sql → Run

# 3. Start Geoff
./start.sh
```

The setup script will:
- Check prerequisites
- Prompt for Supabase credentials
- Create all config files
- Install dependencies
- Register MCP server with Claude

### Managing Services

```bash
./start.sh    # Start orchestrator + web UI
./stop.sh     # Stop all services
```

Logs are saved to `logs/orchestrator.log` and `logs/web.log`.

### Manual Setup

See [User Guide](userguide.md) for step-by-step manual installation.

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

## Security

**⚠️ Important Security Notice**

Geoff runs AI agents with elevated permissions that bypass normal safety confirmations:

- **Claude Code**: Uses `--dangerously-skip-permissions` to skip all permission prompts
- **OpenAI Codex**: Uses `--full-auto` for fully autonomous operation
- **Gemini/OpenCode**: Runs without user confirmation

**This means AI agents can:**
- Read, write, and delete files without asking
- Execute shell commands autonomously
- Make changes without confirmation prompts

**Recommended precautions:**
1. **Configure allowed paths** - Restrict access to specific directories in Settings → Allowed Paths
2. Use only on non-critical projects and hobby codebases
3. Always have version control (git) and backups in place
4. Review agent output before deploying any changes
5. Secure your Tailscale network properly
6. Never run on systems with sensitive data or credentials

### Path Restrictions

Limit file browser and agent access to specific directories:

1. Go to **Settings** → **Allowed Paths**
2. Add directories you want to allow
3. Only those directories (and subdirectories) will be accessible

**This tool is for personal productivity and experimentation only.** Use with appropriate caution.

---

## License

MIT
