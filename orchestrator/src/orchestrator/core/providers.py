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
    prompt_flag: str
    prompt_is_positional: bool = False
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
        cmd.extend([self.config.prompt_flag, prompt])
        if self.config.auto_approve_flag:
            cmd.append(self.config.auto_approve_flag)
        return cmd


class CodexProvider(Provider):
    """OpenAI Codex CLI provider."""

    def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
        cmd = [self.config.command]
        # Codex uses "exec" subcommand for non-interactive
        cmd.append("exec")
        cmd.append(prompt)
        if self.config.auto_approve_flag:
            cmd.append(self.config.auto_approve_flag)
        if working_dir and self.config.working_dir_flag:
            cmd.extend([self.config.working_dir_flag, working_dir])
        return cmd


class GeminiProvider(Provider):
    """Google Gemini CLI provider."""

    def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
        cmd = [self.config.command]
        cmd.extend([self.config.prompt_flag, prompt])
        return cmd


class OpenCodeProvider(Provider):
    """OpenCode CLI provider."""

    def build_command(self, prompt: str, working_dir: Optional[str] = None) -> list[str]:
        cmd = [self.config.command]
        cmd.extend([self.config.prompt_flag, prompt])
        if self.config.quiet_flag:
            cmd.append(self.config.quiet_flag)
        return cmd


# Provider configurations
PROVIDER_CONFIGS: dict[ProviderType, ProviderConfig] = {
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
        prompt_flag="exec",
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
            description="Supports 75+ providers including local models via Ollama",
            has_free_tier=True,
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
        provider_classes: dict[ProviderType, type[Provider]] = {
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
