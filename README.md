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

Your limited time should be spent on the product design and things you enjoy in life, Agents should do the work. Let AI handle the development while you focus on what's important.

---

## How it works

```
Phone (any device) → Geoff → Your PC → Agents do the work
         ↑                                              ↓
         └─────- Verify on the phone and your machine ──┘
```

1. **Your machine runs the orchestrator** - A small Python server that can launch AI agents performing individual tasks
2. **Tailscale connects everything** - Secure access to your machine from anywhere, no port forwarding
3. **Tasks live in Supabase** - Free cloud database, syncs everywhere
4. **Web UI works on mobile** - Create tasks, browse files, launch agents from your phone
5. **Supports Claude Code, OpenAI Codex, Google Cli, OpenCode** - Wide list of providers

---

## Quick Start

### Prerequisites

- A computer (Windows/Mac/Linux) that stays on
- [Python 3.10+](https://python.org) and [uv](https://github.com/astral-sh/uv)
- [Node.js 18+](https://nodejs.org)
- [Claude Code CLI](https://claude.ai/code) (or another AI provider)
- [Supabase](https://supabase.com) account (free tier works)
- [Tailscale](https://tailscale.com) (free) for remote access

### Setup

```bash
# 1. Clone and run setup
git clone https://github.com/belgradGoat/Geoff
cd Geoff
./setup.sh

# 2. Set up database (one-time, detailed setup steps available in UserGuide.md)
#    Go to Supabase → SQL Editor → paste supabase/schema.sql → Run

# 3. Start Geoff
./start.sh
```

That's it. Open http://localhost:4011 in your browser.

For remote access from your phone, use your Tailscale IP (shown after setup).

> **Full setup guide**: See [docs/userguide.md](docs/userguide.md) for manual setup, troubleshooting, and platform-specific notes.

---

## What can you do from your phone?

| Feature | Description |
|---------|-------------|
| **Create tasks** | Quick-add ideas before you forget them |
| **Launch agents** | Tell Claude to work on a task |
| **Interactive chat** | Have conversations with AI agents |
| **Create Projects** | Create folders for new projects and make your ideas happen |
| **Browse and view files** | Navigate your computer filesystem |
| **View code** | Read files to provide context |
| **Create folders** | Set up new project directories |
| **Interact with Github** | Push/Pull to Github, create new branches |

---

## Example workflow

**Monday morning, on the bus:**
> "Add a loading spinner to the submit button in ContactForm.tsx"

**Monday evening, home from work:**
- Open Geoff, check the task
- Agent completed, ready for review
- You review the diff, tweak as needed, move to the next task

**Time spent coding: 5 minutes instead of 30**

---

## Who is this for?

- Vibe Coders with day jobs
- Parents who code after the kids are asleep
- Anyone whose time is precious
- People who think about their side projects at work and forget by evening

This is **not** for:
- Teams or companies (no multi-user features)
- People who want a polished commercial product
- People who are new to Ai assisted coding

---

## Philosophy

- **Securely connect to your machine** - Same agents, same files as when you're at your desk. Continue work from anywhere.
- **Phone-first** - Designed for quick interactions on mobile
- **AI as collaborator** - Agents work on your projects while you're busy
- **Community first** - I built this tool for the community, and is intended to stay free.

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

## Security

**⚠️ Important Security Notice**

This tool runs AI agents with elevated permissions that bypass normal safety confirmations:

| Provider | Flag Used | What It Does |
|----------|-----------|--------------|
| Claude Code | `--dangerously-skip-permissions` | Skips all permission prompts |
| OpenAI Codex | `--full-auto` | Enables fully autonomous mode |
| Gemini/OpenCode | (varies) | Runs without user confirmation |

**What this means:**
- AI agents can read, write, and delete files without asking
- Agents can execute shell commands autonomously
- There are no confirmation prompts for destructive actions

**Before using Geoff, you should:**
1. **Understand the risks** - Review what autonomous AI agents can do
2. **Configure allowed paths** - Restrict file browser and agent access to specific directories (Settings → Allowed Paths)
3. **Use on non-critical projects** - Don't run this on production code or systems with sensitive data
4. **Back up your work** - Have version control (git) and backups in place
5. **Review agent output** - Always check what the agent did before deploying changes
6. **Use Tailscale properly** - Ensure your network is secured and only you have access

### Path Restrictions

You can limit which directories Geoff can access:

1. Go to **Settings** → **Allowed Paths**
2. Add directories you want to allow (e.g., `/Users/you/Projects`)
3. The file browser and agents will only be able to access these directories and their subdirectories

When no paths are configured, all directories are accessible. Configure allowed paths to improve security.

**This tool is designed for personal productivity and experimentation.** Use at your own risk.

---

## License

MIT - Do whatever you want with it. See [LICENSE.md](LICENSE.md) and [Trademarks.md](Trademarks.md).

---

*Vibe Code Anywhere*

<p align="center">
  <a href="https://github.com/sponsors/belgradGoat">
    <img src="https://img.shields.io/badge/Sponsor-♥-ea4aaa?style=flat-square" alt="Sponsor">
  </a>
</p>
