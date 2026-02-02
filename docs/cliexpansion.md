# Tailscale CLI Integration Research

## Executive Summary

This document explores the Tailscale CLI commands available and how they could be leveraged to expand Geoff's (AgentTaskPlanner) remote connectivity capabilities. Tailscale provides a rich set of CLI tools beyond basic VPN connectivity that could enable new use cases for remote agent management.

---

## Available Tailscale CLI Commands

### Core Connection Commands

| Command | Description | Potential Use Case |
|---------|-------------|-------------------|
| `tailscale up` | Connect to Tailscale, logging in if needed | Auto-reconnect scripts |
| `tailscale down` | Disconnect from Tailscale | Graceful shutdown |
| `tailscale status` | Show state of tailscaled and its connections | Health monitoring |
| `tailscale login` | Log in to a Tailscale account | Initial setup automation |
| `tailscale logout` | Disconnect and expire current node key | Security rotation |
| `tailscale switch` | Switch to a different Tailscale account | Multi-tenant support |

### Network Utility Commands

| Command | Description | Potential Use Case |
|---------|-------------|-------------------|
| `tailscale ip [-4] [-6]` | Show Tailscale IP addresses | Auto-configuration |
| `tailscale ping <host>` | Ping at Tailscale layer, show routing | Connectivity diagnostics |
| `tailscale nc <host> <port>` | Netcat - connect to port on host | Raw TCP connections |
| `tailscale netcheck` | Print analysis of network conditions | Troubleshooting |
| `tailscale whois <ip>` | Show machine/user for Tailscale IP | Security auditing |
| `tailscale dns` | Diagnose internal DNS forwarder | DNS troubleshooting |

### SSH and Remote Access

| Command | Description | Potential Use Case |
|---------|-------------|-------------------|
| `tailscale ssh [user@]<host>` | SSH to a Tailscale machine | Remote CLI agent spawning |
| `tailscale set --ssh` | Enable Tailscale SSH server | Secure remote access |

**Key Feature:** Tailscale SSH provides:
- MagicDNS resolution (works even with `--accept-dns=false`)
- Userspace networking support via ProxyCommand
- Automatic SSH host key verification via Tailscale coordination server

### Service Exposure Commands

| Command | Description | Potential Use Case |
|---------|-------------|-------------------|
| `tailscale serve <target>` | Expose local server to tailnet | Share orchestrator internally |
| `tailscale funnel <target>` | Expose local server to internet | Public access (with caution) |
| `tailscale cert <domain>` | Get TLS certs for HTTPS | Secure service endpoints |

**Serve Examples:**
```bash
# Expose orchestrator on port 8080 to tailnet
tailscale serve 8080

# Expose with background mode
tailscale serve --bg 8080

# Expose a specific path
tailscale serve --set-path /api http://localhost:8080

# Check current serve configuration
tailscale serve status
```

**Funnel Examples:**
```bash
# Expose to public internet (use carefully!)
tailscale funnel 3000

# Expose with TCP forwarding
tailscale funnel --tcp 22
```

### File and Drive Sharing

| Command | Description | Potential Use Case |
|---------|-------------|-------------------|
| `tailscale file cp <file> <host>:` | Send files to a host | Transfer task artifacts |
| `tailscale file get` | Receive files from inbox | Collect agent outputs |
| `tailscale drive share <name> <path>` | Share directory with tailnet | Shared project directories |
| `tailscale drive list` | List current shares | Inventory management |

**File Transfer Examples:**
```bash
# Send a file to another machine
tailscale file cp ./report.md phone-device:

# Receive waiting files
tailscale file get ~/Downloads

# Share a project directory
tailscale drive share projects /Users/me/GitHub
```

### Configuration Commands

| Command | Description | Potential Use Case |
|---------|-------------|-------------------|
| `tailscale set` | Change preferences | Runtime configuration |
| `tailscale configure` | Configure host features | Initial setup |
| `tailscale exit-node list` | Show available exit nodes | Network routing |
| `tailscale exit-node suggest` | Suggest best exit node | Auto-routing |

**Key `tailscale set` Flags:**
```bash
--accept-dns          # Accept DNS configuration
--accept-routes       # Accept advertised routes
--advertise-exit-node # Offer to be an exit node
--exit-node <ip>      # Use a specific exit node
--hostname <name>     # Set custom hostname
--ssh                 # Run SSH server
--webclient           # Expose web management at :5252
```

### Monitoring and Diagnostics

| Command | Description | Potential Use Case |
|---------|-------------|-------------------|
| `tailscale status --json` | JSON status output | Programmatic monitoring |
| `tailscale metrics` | Show Tailscale metrics | Performance tracking |
| `tailscale bugreport` | Generate shareable diagnostic ID | Support requests |
| `tailscale version` | Print version | Compatibility checks |

---

## CLI Integration Opportunities for Geoff

### 1. Remote CLI Agent Spawning via Tailscale SSH

**Concept:** Launch AI agents on the home machine directly from a phone or remote device using Tailscale SSH.

**Implementation Approach:**
```bash
# From phone/remote device, SSH to home machine and run agent
tailscale ssh home-machine "cd /path/to/project && claude -p 'Your task here'"
```

**Architecture:**
```
┌──────────────┐     Tailscale SSH     ┌──────────────────────────┐
│    Phone     │ ───────────────────── │     Home Machine         │
│              │                        │  ┌───────────────────┐  │
│  CLI Client  │                        │  │ Agent Process     │  │
│              │                        │  │ (claude/codex/    │  │
│              │                        │  │  gemini/opencode) │  │
└──────────────┘                        │  └───────────────────┘  │
                                        └──────────────────────────┘
```

**Benefits:**
- No web UI required for quick tasks
- Works from any SSH-capable device
- Direct process control
- Faster than web-based launching

**Implementation Steps:**
1. Enable Tailscale SSH on home machine: `tailscale set --ssh`
2. Create shell scripts/aliases for common operations
3. Optional: Create a lightweight CLI wrapper for Geoff

### 2. Lightweight CLI Client

**Concept:** Build a simple CLI tool that can be installed on phones (via Termux on Android, iSH on iOS, or native terminal apps) to interact with Geoff.

**Proposed Commands:**
```bash
# Task management
geoff task list                    # List tasks
geoff task create "Add dark mode"  # Create task
geoff task claim <id>              # Claim a task

# Agent management
geoff agent launch --task <id>     # Launch agent for task
geoff agent status                 # Show agent status
geoff agent output <id>            # Stream agent output
geoff agent stop <id>              # Stop agent

# File operations
geoff file browse /path            # Browse remote files
geoff file read /path/to/file      # Read file content
geoff file edit /path/to/file      # Quick edit (opens $EDITOR)

# Project operations
geoff project list                 # List projects
geoff project switch <name>        # Change active project
```

**Implementation Options:**

**Option A: Python CLI (Typer/Click)**
```python
# geoff_cli/main.py
import typer
import httpx

app = typer.Typer()

@app.command()
def launch(
    task_id: str,
    provider: str = "claude"
):
    """Launch an agent for a task."""
    response = httpx.post(
        f"{ORCHESTRATOR_URL}/api/agents",
        headers={"X-API-Key": API_KEY},
        json={"task_id": task_id, "provider": provider}
    )
    typer.echo(f"Agent launched: {response.json()['id']}")

if __name__ == "__main__":
    app()
```

**Option B: Shell Script Wrapper**
```bash
#!/bin/bash
# geoff - CLI wrapper for Geoff orchestrator

ORCHESTRATOR_URL="${GEOFF_URL:-http://100.x.x.x:8080}"
API_KEY="${GEOFF_API_KEY}"

case "$1" in
    task)
        case "$2" in
            list)
                curl -s -H "X-API-Key: $API_KEY" \
                    "$ORCHESTRATOR_URL/api/tasks?status=ready" | jq
                ;;
            create)
                curl -s -X POST -H "X-API-Key: $API_KEY" \
                    -H "Content-Type: application/json" \
                    -d "{\"title\": \"$3\"}" \
                    "$ORCHESTRATOR_URL/api/tasks" | jq
                ;;
        esac
        ;;
    agent)
        case "$2" in
            launch)
                curl -s -X POST -H "X-API-Key: $API_KEY" \
                    -H "Content-Type: application/json" \
                    -d "{\"task_id\": \"$3\", \"provider\": \"${4:-claude}\"}" \
                    "$ORCHESTRATOR_URL/api/agents" | jq
                ;;
            status)
                curl -s -H "X-API-Key: $API_KEY" \
                    "$ORCHESTRATOR_URL/api/agents" | jq
                ;;
        esac
        ;;
esac
```

### 3. Tailscale Serve for Zero-Config Access

**Concept:** Use `tailscale serve` to automatically expose the orchestrator and web UI to the tailnet without manual port configuration.

**Implementation:**
```bash
# In start.sh, add:
tailscale serve --bg 8080    # Orchestrator API
tailscale serve --bg 4011    # Web UI

# This makes services available at:
# https://your-machine.tail-xxxx.ts.net:8080 (API)
# https://your-machine.tail-xxxx.ts.net:4011 (Web UI)
```

**Benefits:**
- Automatic HTTPS with valid certificates
- No IP address to remember (use MagicDNS hostname)
- Works through firewalls and NAT
- Easy to share access with trusted devices

### 4. File Sharing Integration

**Concept:** Use `tailscale file` and `tailscale drive` for artifact transfer between devices.

**Use Cases:**
- Transfer agent output logs to phone for review
- Send context files from phone to agent's working directory
- Share project directories across devices

**Implementation Example:**
```bash
# On home machine, share project directories
tailscale drive share myproject /Users/me/GitHub/myproject

# On phone, access shared files via WebDAV at:
# http://100.100.100.100:8080/mydomain.com/home-machine/myproject

# Send agent log to phone
tailscale file cp ./agent-output.log phone-device:
```

### 5. Automated Health Monitoring

**Concept:** Use Tailscale status commands to monitor connectivity and auto-restart services.

**Implementation:**
```python
# orchestrator/src/orchestrator/core/health.py

import subprocess
import json

def check_tailscale_connectivity():
    """Check Tailscale connection status."""
    result = subprocess.run(
        ["tailscale", "status", "--json"],
        capture_output=True,
        text=True
    )
    status = json.loads(result.stdout)
    return {
        "connected": status.get("BackendState") == "Running",
        "tailscale_ip": status.get("TailscaleIPs", [])[0] if status.get("TailscaleIPs") else None,
        "peers": len(status.get("Peer", {}))
    }

def ensure_connectivity():
    """Ensure Tailscale is connected, reconnect if needed."""
    status = check_tailscale_connectivity()
    if not status["connected"]:
        subprocess.run(["tailscale", "up"])
        return check_tailscale_connectivity()
    return status
```

### 6. Exit Node for Secure Browsing

**Concept:** Allow agents to route traffic through exit nodes for specific network requirements.

**Use Case:** Agent needs to access resources that are geo-restricted or require specific network paths.

```bash
# Route agent traffic through a specific exit node
tailscale set --exit-node=us-west

# Or use automatic selection
tailscale set --exit-node=auto:any
```

---

## Implementation Roadmap

### Phase 1: SSH-Based Remote CLI (Low Effort, High Value)

1. **Enable Tailscale SSH** on home machine
2. **Create shell aliases** for common operations
3. **Document** SSH-based workflow in user guide

```bash
# Example aliases for ~/.bashrc or ~/.zshrc
alias geoff-task='tailscale ssh home-machine "cd ~/geoff && ./task.sh"'
alias geoff-launch='tailscale ssh home-machine "cd ~/geoff && ./launch-agent.sh"'
```

### Phase 2: Tailscale Serve Integration (Low Effort, Medium Value)

1. **Add** `tailscale serve` commands to `start.sh`
2. **Update** documentation with MagicDNS URLs
3. **Test** HTTPS access across devices

### Phase 3: Lightweight CLI Client (Medium Effort, High Value)

1. **Design** CLI command structure
2. **Implement** Python CLI using Typer
3. **Package** for easy installation (pip, brew, etc.)
4. **Document** CLI usage

### Phase 4: File Sharing Integration (Medium Effort, Medium Value)

1. **Add** Tailscale Drive setup to orchestrator
2. **Create** endpoints for file listing/transfer
3. **Integrate** with web UI file browser

### Phase 5: Advanced Features (Higher Effort)

1. **Health monitoring** with auto-reconnect
2. **Exit node** configuration for agents
3. **Multi-machine** agent distribution

---

## Security Considerations

### SSH Access
- Tailscale SSH requires proper ACLs in the admin console
- Consider limiting which devices can SSH to the home machine
- Use `tailscale lock` for additional security on sensitive networks

### API Key Protection
- CLI client should store API keys securely (keychain, encrypted file)
- Consider short-lived tokens for phone access
- Rotate keys periodically

### Network Exposure
- `tailscale serve` only exposes to tailnet by default (secure)
- `tailscale funnel` exposes to public internet (use with caution)
- Never funnel the orchestrator API without additional auth

### ACL Example
```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:phones"],
      "dst": ["tag:homelab:*"]
    }
  ],
  "ssh": [
    {
      "action": "accept",
      "src": ["tag:phones"],
      "dst": ["tag:homelab"],
      "users": ["autogroup:nonroot"]
    }
  ]
}
```

---

## Comparison: Web UI vs CLI

| Feature | Web UI | CLI (via Tailscale) |
|---------|--------|---------------------|
| Task creation | Forms, rich UI | Quick text commands |
| Agent output | Real-time terminal | SSH or API streaming |
| File browsing | Visual browser | ls, cat, etc. |
| Setup required | Browser only | SSH client or CLI tool |
| Offline support | PWA caching | None (requires connection) |
| Power user features | Limited | Full shell access |
| Mobile UX | Optimized | Requires terminal app |

**Recommendation:** Both approaches complement each other. Web UI for casual use and visual tasks, CLI for power users and automation.

---

## Conclusion

Tailscale provides rich CLI capabilities that can significantly expand Geoff's remote connectivity options:

1. **Tailscale SSH** enables direct agent spawning from any device
2. **Tailscale Serve** simplifies service exposure with automatic HTTPS
3. **Tailscale File/Drive** enables seamless file transfers
4. **Status commands** enable programmatic health monitoring

The recommended approach is to implement these features incrementally, starting with SSH-based access (lowest effort, highest immediate value) and progressing to more sophisticated integrations as needed.

---

## References

- [Tailscale CLI Documentation](https://tailscale.com/kb/1080/cli/)
- [Tailscale SSH](https://tailscale.com/kb/1193/tailscale-ssh/)
- [Tailscale Serve/Funnel](https://tailscale.com/kb/1247/funnel-serve-use-cases/)
- [Tailscale File Sharing](https://tailscale.com/kb/1106/taildrop/)
- [Tailscale Drive](https://tailscale.com/kb/1369/taildrive/)
- [Tailscale ACLs](https://tailscale.com/kb/1018/acls/)
