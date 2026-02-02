# Multi-Provider Implementation Plan

## Overview

This document details the implementation plan for adding support for multiple AI coding CLI providers to Geoff. The implementation excludes Aider (no MCP support) and focuses on providers with MCP compatibility.

**Supported Providers:**
1. Claude Code (default)
2. OpenAI Codex CLI
3. Google Gemini CLI
4. OpenCode

---

## Table of Contents

1. [Architecture Changes](#1-architecture-changes)
2. [Backend Implementation](#2-backend-implementation)
3. [Frontend Implementation](#3-frontend-implementation)
4. [Configuration & Environment](#4-configuration--environment)
5. [MCP Setup Per Provider](#5-mcp-setup-per-provider)
6. [Testing Plan](#6-testing-plan)
7. [File Changes Summary](#7-file-changes-summary)
8. [Implementation Order](#8-implementation-order)

---

## 1. Architecture Changes

### Current Flow
```
Web UI → POST /api/agents → AgentManager → spawn "claude -p ..."
```

### New Flow
```
Web UI → POST /api/agents (with provider) → AgentManager → ProviderRegistry → spawn provider-specific command
```

### Provider Abstraction

```
┌─────────────────────────────────────────────────────────────┐
│                      AgentManager                            │
├─────────────────────────────────────────────────────────────┤
│                    ProviderRegistry                          │
├──────────────┬──────────────┬───────────────┬───────────────┤
│ ClaudeProvider│ CodexProvider│ GeminiProvider│OpenCodeProvider│
└──────────────┴──────────────┴───────────────┴───────────────┘
```

---

## 2. Backend Implementation

### 2.1 New File: `orchestrator/src/orchestrator/core/providers.py`

```python
"""Provider definitions for AI coding CLI tools."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class ProviderType(str, Enum):
    """Supported provider types."""
    CLAUDE = "claude"
    CODEX = "codex"
    GEMINI = "gemini"
    OPENCODE = "opencode"


@dataclass
class ProviderInfo:
    """Provider metadata for UI display."""
    id: str
    name: str
    description: str
    has_free_tier: bool
    mcp_support: bool
    website: str


@dataclass
class ProviderConfig:
    """Configuration for a provider's CLI invocation."""
    provider_type: ProviderType
    command: str
    info: ProviderInfo

    # Command building
    prompt_flag: str
    prompt_is_positional: bool = False  # For codex exec "prompt"
    auto_approve_flag: Optional[str] = None
    working_dir_flag: Optional[str] = None
    json_output_flag: Optional[str] = None
    quiet_flag: Optional[str] = None
    extra_args: list[str] = field(default_factory=list)


class Provider(ABC):
    """Abstract base class for providers."""

    def __init__(self, config: ProviderConfig):
        self.config = config

    @abstractmethod
    def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
        """Build the command line arguments for this provider."""
        pass

    def get_info(self) -> ProviderInfo:
        """Get provider metadata."""
        return self.config.info


class ClaudeProvider(Provider):
    """Claude Code CLI provider."""

    def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
        cmd = [self.config.command]

        # Add prompt
        cmd.extend([self.config.prompt_flag, prompt])

        # Add auto-approve flag
        if self.config.auto_approve_flag:
            cmd.append(self.config.auto_approve_flag)

        return cmd


class CodexProvider(Provider):
    """OpenAI Codex CLI provider."""

    def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
        cmd = [self.config.command]

        # Codex uses "exec" subcommand for non-interactive
        cmd.append("exec")

        # Add prompt (positional for exec)
        cmd.append(prompt)

        # Add full-auto flag
        if self.config.auto_approve_flag:
            cmd.append(self.config.auto_approve_flag)

        # Add working directory if specified and flag exists
        if working_dir and self.config.working_dir_flag:
            cmd.extend([self.config.working_dir_flag, working_dir])

        return cmd


class GeminiProvider(Provider):
    """Google Gemini CLI provider."""

    def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
        cmd = [self.config.command]

        # Add prompt flag
        cmd.extend([self.config.prompt_flag, prompt])

        # Gemini auto-approves in non-interactive mode
        # No additional flags needed

        return cmd


class OpenCodeProvider(Provider):
    """OpenCode CLI provider."""

    def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
        cmd = [self.config.command]

        # Add prompt flag
        cmd.extend([self.config.prompt_flag, prompt])

        # Add quiet flag to suppress spinner
        if self.config.quiet_flag:
            cmd.append(self.config.quiet_flag)

        return cmd


# Provider configurations
PROVIDER_CONFIGS = {
    ProviderType.CLAUDE: ProviderConfig(
        provider_type=ProviderType.CLAUDE,
        command="claude",
        info=ProviderInfo(
            id="claude",
            name="Claude Code",
            description="Anthropic's Claude Code CLI - Best for complex reasoning and large codebases",
            has_free_tier=False,
            mcp_support=True,
            website="https://claude.ai/code",
        ),
        prompt_flag="-p",
        auto_approve_flag="--dangerously-skip-permissions",
    ),
    ProviderType.CODEX: ProviderConfig(
        provider_type=ProviderType.CODEX,
        command="codex",
        info=ProviderInfo(
            id="codex",
            name="OpenAI Codex",
            description="OpenAI's Codex CLI - Requires ChatGPT Plus ($20/mo)",
            has_free_tier=False,
            mcp_support=True,
            website="https://openai.com/codex",
        ),
        prompt_flag="exec",  # Special handling in CodexProvider
        prompt_is_positional=True,
        auto_approve_flag="--full-auto",
        working_dir_flag="--path",
    ),
    ProviderType.GEMINI: ProviderConfig(
        provider_type=ProviderType.GEMINI,
        command="gemini",
        info=ProviderInfo(
            id="gemini",
            name="Google Gemini",
            description="Google's Gemini CLI - FREE tier: 1000 requests/day",
            has_free_tier=True,
            mcp_support=True,
            website="https://github.com/google-gemini/gemini-cli",
        ),
        prompt_flag="-p",
    ),
    ProviderType.OPENCODE: ProviderConfig(
        provider_type=ProviderType.OPENCODE,
        command="opencode",
        info=ProviderInfo(
            id="opencode",
            name="OpenCode",
            description="OpenCode - Supports 75+ providers including local models (Ollama)",
            has_free_tier=True,  # Tool is free, pay for API
            mcp_support=True,
            website="https://github.com/opencode-ai/opencode",
        ),
        prompt_flag="-p",
        quiet_flag="-q",
    ),
}


class ProviderRegistry:
    """Registry of available providers."""

    def __init__(self):
        self._providers: dict[ProviderType, Provider] = {}
        self._initialize_providers()

    def _initialize_providers(self):
        """Initialize all provider instances."""
        provider_classes = {
            ProviderType.CLAUDE: ClaudeProvider,
            ProviderType.CODEX: CodexProvider,
            ProviderType.GEMINI: GeminiProvider,
            ProviderType.OPENCODE: OpenCodeProvider,
        }

        for provider_type, config in PROVIDER_CONFIGS.items():
            provider_class = provider_classes[provider_type]
            self._providers[provider_type] = provider_class(config)

    def get_provider(self, provider_type: ProviderType) -> Provider:
        """Get a provider by type."""
        if provider_type not in self._providers:
            raise ValueError(f"Unknown provider: {provider_type}")
        return self._providers[provider_type]

    def list_providers(self) -> list[ProviderInfo]:
        """List all available providers."""
        return [p.get_info() for p in self._providers.values()]

    def update_command(self, provider_type: ProviderType, command: str):
        """Update the command for a provider (from config/env)."""
        if provider_type in self._providers:
            self._providers[provider_type].config.command = command


# Global registry instance
_registry: Optional[ProviderRegistry] = None


def get_provider_registry() -> ProviderRegistry:
    """Get the global provider registry."""
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
    return _registry
```

### 2.2 Update: `orchestrator/src/orchestrator/core/config.py`

Add provider configuration:

```python
# Add to Settings class:

# Provider Configuration
default_provider: str = os.getenv("ORCHESTRATOR_DEFAULT_PROVIDER", "claude")

# Provider-specific commands (override defaults)
claude_command: str = os.getenv("ORCHESTRATOR_CLAUDE_COMMAND", "claude")
codex_command: str = os.getenv("ORCHESTRATOR_CODEX_COMMAND", "codex")
gemini_command: str = os.getenv("ORCHESTRATOR_GEMINI_COMMAND", "gemini")
opencode_command: str = os.getenv("ORCHESTRATOR_OPENCODE_COMMAND", "opencode")

def get_provider_command(self, provider: str) -> str:
    """Get the command for a specific provider."""
    commands = {
        "claude": self.claude_command,
        "codex": self.codex_command,
        "gemini": self.gemini_command,
        "opencode": self.opencode_command,
    }
    return commands.get(provider, provider)
```

### 2.3 Update: `orchestrator/src/orchestrator/core/agent_manager.py`

Refactor to use providers:

```python
# Add imports
from .providers import (
    ProviderType,
    get_provider_registry,
)

# Update Agent dataclass - add provider field
@dataclass
class Agent:
    """Represents a running agent."""
    id: str
    prompt: str
    working_dir: str
    provider: str = "claude"  # NEW FIELD
    status: AgentStatus = AgentStatus.STARTING
    # ... rest unchanged

    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "prompt": self.prompt,
            "working_dir": self.working_dir,
            "provider": self.provider,  # NEW FIELD
            "status": self.status.value,
            # ... rest unchanged
        }

# Update launch_agent method signature
async def launch_agent(
    self,
    prompt: str,
    working_dir: Optional[str] = None,
    agent_id: Optional[str] = None,
    provider: Optional[str] = None,  # NEW PARAMETER
) -> Agent:
    """Launch a new agent with the specified provider."""

    # ... existing validation ...

    # Determine provider
    provider = provider or self.settings.default_provider

    agent = Agent(
        id=agent_id,
        prompt=prompt,
        working_dir=working_dir,
        provider=provider,  # NEW
    )

    # ... rest unchanged

# Update _run_agent method
async def _run_agent(self, agent: Agent) -> None:
    """Run the agent process and capture output."""
    try:
        # Get provider and build command
        registry = get_provider_registry()
        provider_type = ProviderType(agent.provider)
        provider = registry.get_provider(provider_type)

        # Update command from settings if overridden
        custom_command = self.settings.get_provider_command(agent.provider)
        if custom_command:
            provider.config.command = custom_command

        # Build the command
        cmd = provider.build_command(agent.prompt, agent.working_dir)

        # Create the subprocess
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=agent.working_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        # ... rest unchanged
```

### 2.4 Update: `orchestrator/src/orchestrator/api/agents.py`

Update API endpoint to accept provider:

```python
# Update LaunchAgentRequest
class LaunchAgentRequest(BaseModel):
    prompt: str
    working_dir: Optional[str] = None
    project_id: Optional[str] = None
    provider: Optional[str] = None  # NEW FIELD

# Update launch_agent endpoint
@router.post("", response_model=AgentResponse)
async def launch_agent(
    request: LaunchAgentRequest,
    _: str = Depends(verify_api_key),
):
    """Launch a new agent."""
    # ... existing project lookup logic ...

    try:
        agent = await manager.launch_agent(
            prompt=request.prompt,
            working_dir=working_dir,
            provider=request.provider,  # NEW
        )
        return AgentResponse(**agent.to_dict())
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

# Add new endpoint to list providers
@router.get("/providers")
async def list_providers(_: str = Depends(verify_api_key)):
    """List available AI providers."""
    from ..core.providers import get_provider_registry
    registry = get_provider_registry()
    return {
        "providers": [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "has_free_tier": p.has_free_tier,
                "mcp_support": p.mcp_support,
                "website": p.website,
            }
            for p in registry.list_providers()
        ],
        "default": get_settings().default_provider,
    }
```

---

## 3. Frontend Implementation

### 3.1 New File: `web/src/components/settings/ProviderSettings.tsx`

```tsx
import { useState, useEffect } from 'react'
import { orchestrator } from '../../lib/orchestrator'

interface Provider {
  id: string
  name: string
  description: string
  has_free_tier: boolean
  mcp_support: boolean
  website: string
}

interface ProvidersResponse {
  providers: Provider[]
  default: string
}

export function ProviderSettings() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [defaultProvider, setDefaultProvider] = useState<string>('claude')
  const [selectedProvider, setSelectedProvider] = useState<string>('claude')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadProviders()
    // Load saved preference from localStorage
    const saved = localStorage.getItem('geoff-provider')
    if (saved) {
      setSelectedProvider(saved)
    }
  }, [])

  const loadProviders = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await orchestrator.listProviders()
      setProviders(response.providers)
      setDefaultProvider(response.default)
      // If no saved preference, use server default
      const saved = localStorage.getItem('geoff-provider')
      if (!saved) {
        setSelectedProvider(response.default)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId)
    localStorage.setItem('geoff-provider', providerId)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-geoff-text mb-4">AI Provider</h2>
        <div className="text-geoff-text-muted">Loading providers...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-geoff-text mb-4">AI Provider</h2>
        <div className="text-geoff-error">{error}</div>
        <button
          onClick={loadProviders}
          className="mt-2 text-geoff-accent hover:text-geoff-accent-hover text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-geoff-text">AI Provider</h2>
        {saved && (
          <span className="text-xs text-geoff-success">Saved!</span>
        )}
      </div>

      <p className="text-sm text-geoff-text-muted mb-4">
        Select which AI coding CLI to use when launching agents.
      </p>

      <div className="space-y-3">
        {providers.map((provider) => (
          <label
            key={provider.id}
            className={`block p-4 rounded-lg border cursor-pointer transition-all ${
              selectedProvider === provider.id
                ? 'border-geoff-accent bg-geoff-accent-dim'
                : 'border-geoff-border bg-geoff-surface hover:border-geoff-border-light'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="provider"
                value={provider.id}
                checked={selectedProvider === provider.id}
                onChange={() => handleProviderChange(provider.id)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-geoff-text">{provider.name}</span>
                  {provider.has_free_tier && (
                    <span className="px-1.5 py-0.5 text-xs bg-geoff-success-dim text-geoff-success rounded">
                      Free Tier
                    </span>
                  )}
                  {provider.id === defaultProvider && (
                    <span className="px-1.5 py-0.5 text-xs bg-geoff-accent-dim text-geoff-accent rounded">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-geoff-text-muted mt-1">{provider.description}</p>
                <a
                  href={provider.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-geoff-accent hover:underline mt-1 inline-block"
                  onClick={(e) => e.stopPropagation()}
                >
                  Learn more →
                </a>
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* MCP Setup Notice */}
      <div className="mt-4 p-3 bg-geoff-warning-dim border border-geoff-warning/30 rounded-lg">
        <p className="text-xs text-geoff-warning">
          <strong>Note:</strong> Each provider requires its own CLI installation and MCP configuration.
          See the <a href="https://github.com/yourusername/geoff/docs/userguide.md" className="underline">User Guide</a> for setup instructions.
        </p>
      </div>
    </div>
  )
}
```

### 3.2 Update: `web/src/lib/orchestrator.ts`

Add provider-related types and methods:

```typescript
// Add new interfaces
export interface Provider {
  id: string
  name: string
  description: string
  has_free_tier: boolean
  mcp_support: boolean
  website: string
}

export interface ProvidersResponse {
  providers: Provider[]
  default: string
}

// Update Agent interface
export interface Agent {
  id: string
  prompt: string
  working_dir: string
  provider: string  // NEW
  status: 'starting' | 'running' | 'stopped' | 'failed'
  pid: number | null
  started_at: string
  stopped_at: string | null
  exit_code: number | null
  error: string | null
  output_lines: number
}

// Add to orchestrator object
export const orchestrator = {
  // ... existing methods ...

  async listProviders(): Promise<ProvidersResponse> {
    const response = await fetchWithAuth('/api/agents/providers')
    return response.json()
  },

  // Update launchAgent to accept provider
  async launchAgent(
    prompt: string,
    workingDir?: string,
    projectId?: string,
    provider?: string  // NEW
  ): Promise<Agent> {
    const response = await fetchWithAuth('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        working_dir: workingDir,
        project_id: projectId,
        provider,  // NEW
      }),
    })
    return response.json()
  },
}
```

### 3.3 Update: `web/src/hooks/useAgents.ts`

Update to support provider selection:

```typescript
// Update launchAgent signature
launchAgent: async (
  prompt: string,
  workingDir?: string,
  projectId?: string,
  provider?: string  // NEW
) => {
  try {
    // Get provider from localStorage if not specified
    const selectedProvider = provider || localStorage.getItem('geoff-provider') || undefined

    const agent = await orchestrator.launchAgent(
      prompt,
      workingDir,
      projectId,
      selectedProvider  // NEW
    )
    set((state) => ({
      agents: [agent, ...state.agents],
      agentOutput: { ...state.agentOutput, [agent.id]: [] },
    }))
    return agent
  } catch (e) {
    set({ error: (e as Error).message })
    return null
  }
},
```

### 3.4 Update: `web/src/components/agents/AgentPanel.tsx`

Show which provider an agent is using:

```tsx
// In AgentItem component, add provider display
function AgentItem({ agent, isSelected, onSelect, onStop }: AgentItemProps) {
  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-lg cursor-pointer border transition-all ${
        isSelected
          ? 'border-geoff-accent bg-geoff-accent-dim'
          : 'border-geoff-border bg-geoff-surface hover:border-geoff-border-light'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-geoff-text">{agent.id.slice(0, 8)}</span>
          {/* NEW: Provider badge */}
          <span className="px-1.5 py-0.5 text-xs bg-geoff-surface border border-geoff-border rounded text-geoff-text-muted">
            {agent.provider}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[agent.status]}`}>
          {agent.status}
        </span>
      </div>
      {/* ... rest unchanged */}
    </div>
  )
}
```

### 3.5 Update: `web/src/App.tsx`

Add ProviderSettings to the Settings tab:

```tsx
// Add import
import { ProviderSettings } from './components/settings/ProviderSettings'

// Update settings tab section
{activeTab === 'settings' && (
  <div className="space-y-6">
    <ProjectSelector />

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ProviderSettings />  {/* NEW - First position */}
      <RemoteAccess />
    </div>
  </div>
)}
```

---

## 4. Configuration & Environment

### 4.1 Update `.env.example`

```bash
# =============================================================================
# AI Provider Configuration
# =============================================================================

# Default provider: claude, codex, gemini, opencode
ORCHESTRATOR_DEFAULT_PROVIDER=claude

# Provider CLI commands (override if not in PATH or custom location)
ORCHESTRATOR_CLAUDE_COMMAND=claude
ORCHESTRATOR_CODEX_COMMAND=codex
ORCHESTRATOR_GEMINI_COMMAND=gemini
ORCHESTRATOR_OPENCODE_COMMAND=opencode
```

### 4.2 Provider Installation Commands

Document in userguide.md:

```bash
# Claude Code (default)
# Install from: https://claude.ai/code

# OpenAI Codex CLI
npm install -g @openai/codex

# Google Gemini CLI
npm install -g @anthropic/gemini-cli
# or
brew install gemini-cli

# OpenCode
go install github.com/opencode-ai/opencode@latest
# or
brew install opencode
```

---

## 5. MCP Setup Per Provider

Each provider needs its own MCP server configuration. Document this in userguide.md:

### 5.1 Claude Code (Current)

```bash
claude mcp add-json --scope user agent-task-planner '{
  "type": "stdio",
  "command": "'$(pwd)'/mcp-server/.venv/bin/python",
  "args": ["-m", "agent_task_planner.server"],
  "env": {
    "SUPABASE_URL": "your-url",
    "SUPABASE_SERVICE_KEY": "your-key"
  }
}'
```

### 5.2 OpenAI Codex

```bash
# Codex uses a similar MCP configuration
codex mcp add agent-task-planner \
  --command "$(pwd)/mcp-server/.venv/bin/python" \
  --args "-m agent_task_planner.server" \
  --env SUPABASE_URL=your-url \
  --env SUPABASE_SERVICE_KEY=your-key
```

### 5.3 Google Gemini CLI

```bash
# Gemini CLI uses ~/.gemini/settings.json or mcpServers in config
# Add to ~/.gemini/settings.json:
{
  "mcpServers": {
    "agent-task-planner": {
      "command": "/path/to/mcp-server/.venv/bin/python",
      "args": ["-m", "agent_task_planner.server"],
      "env": {
        "SUPABASE_URL": "your-url",
        "SUPABASE_SERVICE_KEY": "your-key"
      }
    }
  }
}
```

### 5.4 OpenCode

```bash
# OpenCode uses similar MCP configuration
# Add to ~/.opencode/config.json:
{
  "mcpServers": {
    "agent-task-planner": {
      "command": "/path/to/mcp-server/.venv/bin/python",
      "args": ["-m", "agent_task_planner.server"],
      "env": {
        "SUPABASE_URL": "your-url",
        "SUPABASE_SERVICE_KEY": "your-key"
      }
    }
  }
}
```

---

## 6. Testing Plan

### 6.1 Unit Tests

```python
# orchestrator/tests/test_providers.py

def test_claude_provider_builds_correct_command():
    provider = ClaudeProvider(PROVIDER_CONFIGS[ProviderType.CLAUDE])
    cmd = provider.build_command("test prompt", "/work/dir")
    assert cmd == ["claude", "-p", "test prompt", "--dangerously-skip-permissions"]

def test_codex_provider_builds_correct_command():
    provider = CodexProvider(PROVIDER_CONFIGS[ProviderType.CODEX])
    cmd = provider.build_command("test prompt", "/work/dir")
    assert cmd == ["codex", "exec", "test prompt", "--full-auto", "--path", "/work/dir"]

def test_gemini_provider_builds_correct_command():
    provider = GeminiProvider(PROVIDER_CONFIGS[ProviderType.GEMINI])
    cmd = provider.build_command("test prompt", "/work/dir")
    assert cmd == ["gemini", "-p", "test prompt"]

def test_opencode_provider_builds_correct_command():
    provider = OpenCodeProvider(PROVIDER_CONFIGS[ProviderType.OPENCODE])
    cmd = provider.build_command("test prompt", "/work/dir")
    assert cmd == ["opencode", "-p", "test prompt", "-q"]

def test_provider_registry_lists_all_providers():
    registry = get_provider_registry()
    providers = registry.list_providers()
    assert len(providers) == 4
    assert any(p.id == "claude" for p in providers)
```

### 6.2 Integration Tests

1. **API Endpoint Test**: Verify `/api/agents/providers` returns all providers
2. **Launch with Provider Test**: Launch agent with each provider type
3. **Default Provider Test**: Verify default provider is used when not specified
4. **Invalid Provider Test**: Verify error handling for unknown provider

### 6.3 Manual Testing Checklist

- [ ] Settings page shows all providers
- [ ] Provider selection persists after refresh
- [ ] Agent panel shows provider badge for each agent
- [ ] Launching with each provider works (if CLI installed)
- [ ] Error message shown if provider CLI not installed
- [ ] MCP tools work with each provider

---

## 7. File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `orchestrator/src/orchestrator/core/providers.py` | Provider abstraction layer |
| `web/src/components/settings/ProviderSettings.tsx` | Provider selector UI |
| `orchestrator/tests/test_providers.py` | Provider unit tests |

### Modified Files

| File | Changes |
|------|---------|
| `orchestrator/src/orchestrator/core/config.py` | Add provider config options |
| `orchestrator/src/orchestrator/core/agent_manager.py` | Use provider registry |
| `orchestrator/src/orchestrator/api/agents.py` | Add provider param, list endpoint |
| `web/src/lib/orchestrator.ts` | Add provider types and methods |
| `web/src/hooks/useAgents.ts` | Support provider in launchAgent |
| `web/src/components/agents/AgentPanel.tsx` | Show provider badge |
| `web/src/App.tsx` | Add ProviderSettings to Settings tab |
| `.env.example` | Add provider configuration |
| `docs/userguide.md` | Document provider setup |

---

## 8. Implementation Order

### Phase 1: Backend Foundation (Day 1)

1. Create `providers.py` with all provider classes
2. Update `config.py` with provider settings
3. Update `agent_manager.py` to use providers
4. Update `agents.py` API endpoints
5. Write unit tests

### Phase 2: Frontend Integration (Day 2)

1. Update `orchestrator.ts` with provider types/methods
2. Create `ProviderSettings.tsx` component
3. Update `useAgents.ts` hook
4. Update `AgentPanel.tsx` with provider badge
5. Add ProviderSettings to Settings tab in `App.tsx`

### Phase 3: Documentation & Testing (Day 3)

1. Update `.env.example`
2. Update `docs/userguide.md` with provider setup instructions
3. Manual testing with each provider (where available)
4. Fix any issues found

### Phase 4: Polish (Day 3-4)

1. Error handling for missing CLIs
2. Provider-specific error messages
3. Update README if needed
4. Final review and cleanup

---

## Verification Checklist

- [ ] `/api/agents/providers` returns all 4 providers
- [ ] Default provider is "claude"
- [ ] Settings page shows provider selector
- [ ] Selected provider persists in localStorage
- [ ] Agents launch with correct provider
- [ ] Agent list shows provider badge
- [ ] Each provider builds correct CLI command
- [ ] MCP documentation updated for all providers
- [ ] Error handling works for missing CLIs
