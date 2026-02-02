"""Slash command definitions and registry."""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class CommandCategory(Enum):
    """Categories of slash commands."""
    ORCHESTRATOR = "orchestrator"  # Handled locally by orchestrator
    PASSTHROUGH = "passthrough"    # Sent to provider CLI
    SESSION = "session"            # Affect session state


@dataclass
class CommandDefinition:
    """Definition of a slash command."""
    name: str
    category: CommandCategory
    description: str
    providers: list[str]  # Empty list = available for all providers


@dataclass
class CommandResult:
    """Result of executing a slash command."""
    success: bool
    output: str
    action: Optional[str] = None  # e.g., "clear_history", "switch_provider", "new_session"


class CommandRegistry:
    """Registry of available slash commands."""

    def __init__(self):
        self._commands: dict[str, CommandDefinition] = {}
        self._register_defaults()

    def _register_defaults(self):
        """Register default commands for all providers."""
        # Orchestrator commands - handled locally, available for all providers
        self.register(CommandDefinition(
            "help", CommandCategory.ORCHESTRATOR,
            "Show available commands", []
        ))
        self.register(CommandDefinition(
            "clear", CommandCategory.ORCHESTRATOR,
            "Clear chat history", []
        ))
        self.register(CommandDefinition(
            "status", CommandCategory.ORCHESTRATOR,
            "Show session status", []
        ))
        self.register(CommandDefinition(
            "providers", CommandCategory.ORCHESTRATOR,
            "List available providers", []
        ))
        self.register(CommandDefinition(
            "switch", CommandCategory.ORCHESTRATOR,
            "Switch to a different provider", []
        ))

        # Session commands - affect session state
        self.register(CommandDefinition(
            "new", CommandCategory.SESSION,
            "Start a new conversation", []
        ))

        # Note: Provider-specific passthrough commands (like /usage, /model, /compact)
        # are not supported in message-per-request mode. Use the CLI directly for those.

    def register(self, cmd: CommandDefinition):
        """Register a command."""
        self._commands[cmd.name] = cmd

    def get(self, name: str) -> Optional[CommandDefinition]:
        """Get a command by name."""
        return self._commands.get(name)

    def for_provider(self, provider: str) -> list[CommandDefinition]:
        """Get all commands available for a specific provider."""
        return [
            cmd for cmd in self._commands.values()
            if not cmd.providers or provider in cmd.providers
        ]

    def all_commands(self) -> list[CommandDefinition]:
        """Get all registered commands."""
        return list(self._commands.values())
