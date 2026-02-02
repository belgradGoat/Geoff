"""Command processor for handling slash commands."""

import re
from typing import AsyncGenerator, Optional, Tuple

from .commands import CommandRegistry, CommandCategory, CommandResult
from .agent_manager import AgentManager


class CommandProcessor:
    """Processes slash commands from chat input."""

    # Pattern to match slash commands: /command [args]
    PATTERN = re.compile(r'^/(\w+)(?:\s+(.*))?$')

    def __init__(self):
        self.registry = CommandRegistry()

    def is_command(self, message: str) -> bool:
        """Check if a message is a slash command."""
        return message.strip().startswith('/')

    def parse(self, message: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Parse a command message into command name and arguments.

        Args:
            message: The raw message string

        Returns:
            Tuple of (command_name, args) or (None, None) if not a valid command
        """
        match = self.PATTERN.match(message.strip())
        if match:
            return (match.group(1).lower(), match.group(2))
        return (None, None)

    async def process(
        self,
        message: str,
        session_id: str,
        provider: str,
        agent_manager: AgentManager,
    ) -> AsyncGenerator[str, None]:
        """
        Process a slash command and yield output.

        Args:
            message: The command message (e.g., "/help")
            session_id: The current chat session ID
            provider: The current provider name
            agent_manager: The agent manager instance

        Yields:
            Output lines from command execution
        """
        cmd_name, args = self.parse(message)

        if not cmd_name:
            yield "Invalid command format. Use /help to see available commands."
            return

        cmd = self.registry.get(cmd_name)

        if not cmd:
            yield f"Unknown command: /{cmd_name}. Use /help to see available commands."
            return

        # Check if command is available for this provider
        if cmd.providers and provider not in cmd.providers:
            yield f"/{cmd_name} is not available for {provider}. Use /help to see available commands."
            return

        # Route to appropriate handler based on category
        if cmd.category == CommandCategory.ORCHESTRATOR:
            result = await self._handle_orchestrator_command(
                cmd_name, args, provider, agent_manager, session_id
            )
            yield result.output

        elif cmd.category == CommandCategory.PASSTHROUGH:
            # Passthrough commands don't work with message-per-request model
            # because the CLI isn't in true interactive mode
            yield f"/{cmd_name} is a provider command that requires interactive CLI mode."
            yield f"This command is not supported in the current chat architecture."
            yield f"Use the {provider} CLI directly for this feature."

        elif cmd.category == CommandCategory.SESSION:
            result = await self._handle_session_command(
                cmd_name, args, session_id, agent_manager
            )
            yield result.output

    async def _handle_orchestrator_command(
        self,
        cmd: str,
        args: Optional[str],
        provider: str,
        manager: AgentManager,
        session_id: str,
    ) -> CommandResult:
        """Handle orchestrator-level commands."""

        if cmd == "help":
            return self._build_help_response(provider)

        elif cmd == "clear":
            return CommandResult(
                success=True,
                output="Chat history cleared.",
                action="clear_history"
            )

        elif cmd == "status":
            return self._build_status_response(manager, session_id, provider)

        elif cmd == "providers":
            return self._build_providers_response()

        elif cmd == "switch":
            if not args:
                return CommandResult(
                    success=False,
                    output="Usage: /switch <provider>\nAvailable: claude, codex, gemini, opencode"
                )
            target_provider = args.strip().lower()
            valid_providers = ["claude", "codex", "gemini", "opencode"]
            if target_provider not in valid_providers:
                return CommandResult(
                    success=False,
                    output=f"Unknown provider: {target_provider}\nAvailable: {', '.join(valid_providers)}"
                )
            return CommandResult(
                success=True,
                output=f"Switching to {target_provider}...",
                action="switch_provider"
            )

        return CommandResult(success=False, output="Unknown orchestrator command")

    async def _handle_session_command(
        self,
        cmd: str,
        args: Optional[str],
        session_id: str,
        manager: AgentManager,
    ) -> CommandResult:
        """Handle session-level commands."""

        if cmd == "new":
            return CommandResult(
                success=True,
                output="Starting new conversation...",
                action="new_session"
            )

        return CommandResult(success=False, output="Unknown session command")

    def _build_help_response(self, provider: str) -> CommandResult:
        """Build help response showing available commands."""
        commands = self.registry.for_provider(provider)

        # Group commands by category
        orchestrator_cmds = [c for c in commands if c.category == CommandCategory.ORCHESTRATOR]
        session_cmds = [c for c in commands if c.category == CommandCategory.SESSION]

        lines = [f"Available commands ({provider}):", ""]

        for cmd in orchestrator_cmds:
            lines.append(f"  /{cmd.name} - {cmd.description}")

        for cmd in session_cmds:
            lines.append(f"  /{cmd.name} - {cmd.description}")

        lines.append("")
        lines.append("Note: Provider-specific commands (like /usage, /model)")
        lines.append("require the CLI directly and aren't supported here.")

        return CommandResult(success=True, output="\n".join(lines))

    def _build_status_response(
        self,
        manager: AgentManager,
        session_id: str,
        provider: str,
    ) -> CommandResult:
        """Build status response showing session info."""
        agent = manager.get_agent(session_id)

        if not agent:
            return CommandResult(success=False, output="Session not found")

        lines = [
            "Session Status:",
            f"  Session ID: {session_id[:8]}...",
            f"  Provider: {provider}",
            f"  Status: {agent.status.value}",
            f"  Messages: {agent.message_count}",
            f"  Working Dir: {agent.working_dir}",
        ]

        return CommandResult(success=True, output="\n".join(lines))

    def _build_providers_response(self) -> CommandResult:
        """Build response listing available providers."""
        from .providers import get_provider_registry

        registry = get_provider_registry()
        providers = registry.list_providers()

        lines = ["Available providers:", ""]
        for p in providers:
            free_indicator = " (FREE tier)" if p.has_free_tier else ""
            lines.append(f"  {p.id} - {p.name}{free_indicator}")
            lines.append(f"    {p.description}")
            lines.append("")

        lines.append("Use /switch <provider> to change providers.")

        return CommandResult(success=True, output="\n".join(lines))
