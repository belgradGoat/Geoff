# Geoff

**Your side projects make progress while you're at work.**

---

You're on the train to work. You have an idea for your side project. You pull out your phone, open Geoff, and type:

> "Add dark mode to the settings page"
> "Create devlopment plan for the new feature"
> "Implement development plan"


You put your phone away and go to your meetings. When you leave, it's done. You give your Agent next task on the way to lunch.

That's Geoff.

---

## What is this?

Geoff is a tool to Vibe Code anywhere. People who have great ideas and want AI agents to work for them, while they focus on their life. People who don't have 8 hours a day to sit in an IDE.

It lets you:
- **Capture tasks from your phone** while you're away from your computer
- **Launch AI agents** to work on those tasks
- **Check progress remotely** and see what got done

Your limited time should be spent on the product design and things you enjoy in life, not boilerplate. Let AI handle the boring stuff while you're stuck in meetings.

---

## How it works

```
Phone (anywhere) → Geoff → Your Computer (at home) → Agents do the work
         ↑                                              ↓
         └─────- Verify on the phone and your machine ──┘
```

1. **Your machine runs the orchestrator** - A small Python server that can launch AI agents performing individual tasks
2. **Tailscale connects everything** - Secure access to your machine from anywhere, no port forwarding
3. **Tasks live in Supabase** - Free cloud database, syncs everywhere
4. **Web UI works on mobile** - Create tasks, browse files, launch agents from your phone
5. **Supports Claude Code, OpenAI Codex, Google Cli, OpenCode** - Wide list of providers

---

## The setup (one-time, ~30 minutes)

You'll need:
- A computer (Mac/Linux/Windows) that stays on
- [Claude Code CLI](https://claude.ai/code) installed - or any other provider from the list
- [Tailscale](https://tailscale.com) (free) for secure remote access
- [Supabase](https://supabase.com) account (free tier works)

### 1. Clone and configure

```bash
git clone <https://github.com/belgradGoat/Geoff>
cd AgentTaskPlanner
cp .env.example .env
# Edit .env with your Supabase credentials
```

### 2. Set up the database

1. Go to your Supabase project → SQL Editor
2. Copy the contents of `supabase/schema.sql`
3. Paste and run it

That's it - one file sets up everything (tables, indexes, triggers, RLS policies).

### 3. Install and register the MCP server

This gives Claude agents access to task tools.

```bash
cd mcp-server
uv venv && source .venv/bin/activate
uv pip install -e .
```

Register with Claude Code (use `--scope user` so spawned agents can access it):

```bash
claude mcp add-json --scope user agent-task-planner '{
  "type": "stdio",
  "command": "'$(pwd)'/.venv/bin/python",
  "args": ["-m", "agent_task_planner.server"],
  "env": {
    "SUPABASE_URL": "your-supabase-url",
    "SUPABASE_SERVICE_KEY": "your-service-key"
  }
}'
```

Verify: `claude mcp list` should show `agent-task-planner: ... ✓ Connected`

### 4. Start the orchestrator

```bash
cd orchestrator
uv run uvicorn orchestrator.main:app --host 0.0.0.0 --port 8080
```

### 5. Start the web UI

```bash
cd web
npm install
npm run dev
```

### 6. Connect Tailscale

```bash
tailscale up
tailscale ip -4  # Note this IP
```

Now open `http://<your-tailscale-ip>:4011` from your phone. You're in.

> **Full setup guide**: See [docs/userguide.md](docs/userguide.md) for detailed instructions, troubleshooting, and platform-specific notes (Windows/Linux).

---

## What can you do from your phone?

| Feature | Description |
|---------|-------------|
| **Create tasks** | Quick-add ideas before you forget them |
| **Launch agents** | Tell Claude to work on a task |
| **Watch progress** | Stream agent output in real-time |
| **Browse files** | Navigate your Mac's filesystem |
| **View code** | Read files to provide context |
| **Create folders** | Set up new project directories |

---

## Example workflow

**Monday morning, on the bus:**
> "Add a loading spinner to the submit button in ContactForm.tsx"

**Monday evening, home from work:**
- Open Geoff, check the task
- Agent completed it, pushed a commit
- You review the diff, tweak one line, done

**Time spent coding: 5 minutes instead of 30**

---

## Who is this for?

- Solo developers with day jobs
- Parents who code after the kids are asleep
- Anyone whose hobby time is precious
- People who think about their side projects at work and forget by evening

This is **not** for:
- Teams or companies (no multi-user features)
- People who want a polished commercial product
- Anyone who needs uptime guarantees

---

## Philosophy

- **Your machine, your data** - Everything runs locally, nothing sent anywhere except Supabase (which you control)
- **Phone-first** - Designed for quick interactions on mobile
- **AI as collaborator** - Agents work on the boring parts, you do the creative parts
- **Community first** - This is a tool we build together. If I ever charge for anything, it'll be for convenience (like a hosted version that skips the setup), never for features

---

## Contributing

This is a community project. If you're a hobby developer who wants to make this better, PRs are welcome.

- Found a bug? Open an issue
- Have an idea? Start a discussion
- Built something cool? Share it

---

## Docs

- [User Guide](docs/userguide.md) - Detailed setup and usage
- [Developer Guide](docs/developerguide.md) - Architecture and contribution guide

---

## License

MIT - Do whatever you want with it. See [LICENSE.md](LICENSE.md) and [Trademarks.md](Trademarks.md).

---

*Built by hobby developers, for hobby developers.*

<p align="center">
  <a href="https://github.com/sponsors/belgradGoat">
    <img src="https://img.shields.io/badge/Sponsor-♥-ea4aaa?style=flat-square" alt="Sponsor">
  </a>
</p>
