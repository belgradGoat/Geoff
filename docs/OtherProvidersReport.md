# Multi-Provider Support Feasibility Report

## Executive Summary

Adding support for multiple AI coding CLI providers is **technically feasible** with moderate implementation effort. The current architecture is well-suited for abstraction, and most major CLI tools support non-interactive modes with similar invocation patterns.

**Recommended providers to support:**
1. **OpenAI Codex CLI** - Enterprise users, strong reasoning
2. **Google Gemini CLI** - Free tier (1000 req/day), open source
3. **OpenCode** - Multi-provider flexibility, local models via Ollama
4. **Aider** - Git-first workflows, model agnostic

---

## Current Architecture

The orchestrator currently spawns Claude agents via:

```python
process = await asyncio.create_subprocess_exec(
    self.settings.claude_command,  # "claude"
    "-p", agent.prompt,
    "--dangerously-skip-permissions",
    cwd=agent.working_dir,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.STDOUT,
)
```

**Key integration points:**
- `config.py`: `claude_command` setting
- `agent_manager.py`: Process spawning logic
- Web UI: Agent panel (prompt input, output streaming)

---

## Provider Analysis

### 1. OpenAI Codex CLI

**Status:** Production-ready, actively developed

**Non-interactive invocation:**
```bash
codex exec "your prompt here"
codex exec --json "your prompt"  # Structured output
codex -p "prompt" --full-auto    # Auto-approve commands
```

**Key flags:**
| Flag | Purpose |
|------|---------|
| `exec` | Non-interactive mode |
| `--json` | JSONL output stream |
| `--full-auto` | Auto-approve + workspace sandbox |
| `--dangerously-bypass-approvals-and-sandbox` | Skip all safety (like Claude's flag) |
| `--model gpt-5-codex` | Model selection |
| `--path /dir` | Working directory |

**MCP Support:** Yes - Codex supports MCP servers

**Pricing:** Requires ChatGPT Plus ($20/mo) minimum, no free tier

**Integration complexity:** Low - Very similar to Claude Code

**Sources:**
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [Non-interactive Mode](https://developers.openai.com/codex/noninteractive/)

---

### 2. Google Gemini CLI

**Status:** Production-ready, open source (Apache 2.0)

**Non-interactive invocation:**
```bash
gemini -p "your prompt here"
gemini -p "prompt" --output-format json
echo "prompt" | gemini  # Pipe mode
```

**Key flags:**
| Flag | Purpose |
|------|---------|
| `-p` / `--prompt` | Non-interactive prompt |
| `--output-format json` | Structured output |
| `-i` / `--prompt-interactive` | Interactive with initial prompt |
| `--sandbox` | Sandbox mode |

**MCP Support:** Yes - Built-in MCP support

**Pricing:** FREE tier - 60 req/min, 1000 req/day with personal Google account

**Integration complexity:** Low - Similar pattern to Claude

**Sources:**
- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli)
- [Headless Mode Docs](https://google-gemini.github.io/gemini-cli/docs/cli/headless.html)
- [Google Announcement](https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/)

---

### 3. OpenCode

**Status:** Active development, open source

**Non-interactive invocation:**
```bash
opencode -p "your prompt here"
opencode -p "prompt" -f json     # JSON output
opencode -p "prompt" -q          # Quiet mode (no spinner)
```

**Key flags:**
| Flag | Purpose |
|------|---------|
| `-p` | Non-interactive prompt |
| `-f json` | JSON output format |
| `-q` / `--quiet` | No spinner (for scripts) |
| `--allowedTools` | Restrict available tools |
| `--verbose` | Debug logging |

**MCP Support:** Yes - Supports MCP servers

**Model flexibility:** 75+ providers including:
- OpenAI, Anthropic, Google, AWS Bedrock
- Local models via Ollama
- OpenRouter for model switching

**Pricing:** Tool is free, pay for API usage per provider

**Integration complexity:** Low - Very similar invocation pattern

**Unique advantage:** Users can bring their own API keys for any provider

**Sources:**
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [OpenCode CLI Docs](https://opencode.ai/docs/cli/)

---

### 4. Aider

**Status:** Mature, widely used, open source

**Non-interactive invocation:**
```bash
aider --message "your prompt" --yes file1.py file2.py
aider -m "prompt" --yes --auto-commits
```

**Key flags:**
| Flag | Purpose |
|------|---------|
| `-m` / `--message` | Non-interactive prompt |
| `--yes` | Auto-approve all changes |
| `--auto-commits` | Auto-commit changes |
| `--dry-run` | Preview without changes |
| `--model` | Model selection |

**MCP Support:** No native MCP support

**Model flexibility:** Works with Claude, GPT-4, Gemini, DeepSeek, local models

**Pricing:** Tool is free, pay for API usage

**Integration complexity:** Medium
- Different output format (not JSON stream)
- Git-centric workflow may not match all use cases
- No MCP means tasks would need different integration approach

**Sources:**
- [Aider Usage Docs](https://aider.chat/docs/usage.html)
- [Aider Scripting](https://aider.chat/docs/scripting.html)
- [Aider GitHub](https://github.com/paul-gauthier/aider)

---

## MCP Compatibility Analysis

The current Geoff workflow relies on MCP for task management:
1. Agent spawns with MCP server access
2. Agent calls `task_get_ready`, `task_claim`, `task_complete`
3. Task status syncs to Supabase in real-time

| Provider | MCP Support | Task Integration |
|----------|-------------|------------------|
| Claude Code | Yes (native) | Full support |
| Codex CLI | Yes | Full support possible |
| Gemini CLI | Yes | Full support possible |
| OpenCode | Yes | Full support possible |
| Aider | No | Would need alternative approach |

**For Aider:** Tasks could be passed via prompt context rather than MCP tools, but this loses real-time status updates.

---

## Implementation Approach

### Phase 1: Provider Abstraction

Create a provider interface:

```python
# orchestrator/src/orchestrator/core/providers.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

@dataclass
class ProviderConfig:
    name: str
    command: str
    prompt_flag: str
    auto_approve_flag: Optional[str]
    working_dir_flag: Optional[str]
    json_output_flag: Optional[str]
    extra_args: list[str]

class Provider(ABC):
    @abstractmethod
    def build_command(self, prompt: str, working_dir: str) -> list[str]:
        pass

PROVIDERS = {
    "claude": ProviderConfig(
        name="Claude Code",
        command="claude",
        prompt_flag="-p",
        auto_approve_flag="--dangerously-skip-permissions",
        working_dir_flag=None,  # Uses cwd
        json_output_flag=None,
        extra_args=[],
    ),
    "codex": ProviderConfig(
        name="OpenAI Codex",
        command="codex",
        prompt_flag="exec",  # Different pattern
        auto_approve_flag="--full-auto",
        working_dir_flag="--path",
        json_output_flag="--json",
        extra_args=[],
    ),
    "gemini": ProviderConfig(
        name="Google Gemini",
        command="gemini",
        prompt_flag="-p",
        auto_approve_flag=None,  # Auto in non-interactive
        working_dir_flag=None,  # Uses cwd
        json_output_flag="--output-format json",
        extra_args=[],
    ),
    "opencode": ProviderConfig(
        name="OpenCode",
        command="opencode",
        prompt_flag="-p",
        auto_approve_flag=None,  # Auto in non-interactive
        working_dir_flag=None,  # Uses cwd
        json_output_flag="-f json",
        extra_args=["-q"],  # Quiet mode
    ),
    "aider": ProviderConfig(
        name="Aider",
        command="aider",
        prompt_flag="--message",
        auto_approve_flag="--yes",
        working_dir_flag=None,  # Uses cwd
        json_output_flag=None,  # No JSON mode
        extra_args=["--auto-commits"],
    ),
}
```

### Phase 2: Config Updates

```python
# config.py additions

# Provider selection
provider: str = os.getenv("ORCHESTRATOR_PROVIDER", "claude")

# Provider-specific commands (override defaults)
claude_command: str = os.getenv("ORCHESTRATOR_CLAUDE_COMMAND", "claude")
codex_command: str = os.getenv("ORCHESTRATOR_CODEX_COMMAND", "codex")
gemini_command: str = os.getenv("ORCHESTRATOR_GEMINI_COMMAND", "gemini")
opencode_command: str = os.getenv("ORCHESTRATOR_OPENCODE_COMMAND", "opencode")
aider_command: str = os.getenv("ORCHESTRATOR_AIDER_COMMAND", "aider")
```

### Phase 3: API Updates

Add provider selection to launch endpoint:

```python
# POST /api/agents
{
    "prompt": "...",
    "working_dir": "...",
    "provider": "gemini"  # New field, defaults to config
}
```

### Phase 4: Web UI Updates

Add provider selector dropdown in Agent Panel:

```tsx
<select value={provider} onChange={...}>
  <option value="claude">Claude Code</option>
  <option value="codex">OpenAI Codex</option>
  <option value="gemini">Google Gemini (Free)</option>
  <option value="opencode">OpenCode</option>
  <option value="aider">Aider</option>
</select>
```

---

## Effort Estimates

| Task | Complexity | Files Changed |
|------|------------|---------------|
| Provider abstraction layer | Medium | 2-3 new files |
| Config updates | Low | 1 file |
| Agent manager refactor | Medium | 1 file |
| API endpoint updates | Low | 1-2 files |
| Web UI provider selector | Low | 1-2 files |
| MCP config per provider | Medium | Docs + config |
| Testing all providers | High | Manual testing needed |

**Total estimate:** 2-3 days of focused work

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider CLI changes break integration | High | Version pin CLIs, test regularly |
| MCP config differs per provider | Medium | Document per-provider MCP setup |
| Output format inconsistency | Medium | Normalize output in orchestrator |
| User confusion with multiple options | Low | Good defaults, clear docs |
| Aider lacks MCP | Medium | Document limitations, prompt-based fallback |

---

## Recommendations

### Immediate (High Value, Low Effort)
1. **Add Gemini CLI** - Free tier makes it accessible to everyone
2. **Add OpenCode** - Flexibility for power users with their own API keys

### Near-term
3. **Add Codex CLI** - For users already on ChatGPT Plus
4. **Provider abstraction** - Clean architecture for future providers

### Future Consideration
5. **Aider** - Only if Git-first workflow is specifically requested
6. **Local models** - OpenCode already supports Ollama, could highlight this

---

## Conclusion

Multi-provider support is feasible and valuable. The recommended approach:

1. Start with **Gemini CLI** (free, MCP support, similar API)
2. Add **OpenCode** (model flexibility, MCP support)
3. Build proper abstraction layer
4. Add **Codex** for enterprise users

This gives users choice based on their needs:
- **Cost-conscious:** Gemini CLI (free tier)
- **Flexibility:** OpenCode (any provider/model)
- **Enterprise:** Codex or Claude
- **Best quality:** Claude Code (current default)

---

## References

- [Top 5 CLI Coding Agents (DEV Community)](https://dev.to/lightningdev123/top-5-cli-coding-agents-in-2026-3pia)
- [CLI AI Tools Comparison (CodeAnt)](https://www.codeant.ai/blogs/claude-code-cli-vs-codex-cli-vs-gemini-cli-best-ai-cli-tool-for-developers-in-2025)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli)
- [Aider Documentation](https://aider.chat/docs/)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [Agentic CLI Tools Comparison](https://research.aimultiple.com/agentic-cli/)
