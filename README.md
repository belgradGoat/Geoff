# Geoff

**Your side projects make progress while you're at work.**

---

You're on the train to work. You have an idea for your side project. You pull out your phone, open Geoff, and type:

> "Add dark mode to the settings page"

You put your phone away and go to your meetings. When you get home, it's done.

That's Geoff.

---

## What is this?

Geoff is a tool for hobby developers with day jobs. People who code on evenings and weekends. People who don't have 8 hours a day to sit in an IDE.

It lets you:
- **Capture tasks from your phone** while you're away from your computer
- **Launch AI agents** to work on those tasks
- **Check progress remotely** and see what got done

Your limited hobby time should be spent on the fun parts of coding, not boilerplate. Let AI handle the boring stuff while you're stuck in meetings.

---

## How it works

```
Phone (anywhere) → Geoff → Your Mac (at home) → Claude agents do the work
         ↑                                              ↓
         └──────────── See results when you get home ──┘
```

1. **Your Mac runs the orchestrator** - A small Python server that can launch Claude Code agents
2. **Tailscale connects everything** - Secure access to your Mac from anywhere, no port forwarding
3. **Tasks live in Supabase** - Free cloud database, syncs everywhere
4. **Web UI works on mobile** - Create tasks, browse files, launch agents from your phone

---

## The setup (one-time, ~30 minutes)

You'll need:
- A Mac (or Linux/Windows) that stays on
- [Claude Code CLI](https://claude.ai/code) installed
- [Tailscale](https://tailscale.com) (free) for secure remote access
- [Supabase](https://supabase.com) account (free tier works)

### 1. Clone and configure

```bash
git clone <this-repo-url>
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

MIT - Do whatever you want with it.

---

*Built by hobby developers, for hobby developers.*

If Geoff saves you time, you can [buy me a coffee](https://github.com/sponsors/YOUR_USERNAME).
