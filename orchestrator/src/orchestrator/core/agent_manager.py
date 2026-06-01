"""Agent process management."""

import asyncio
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


def utcnow() -> datetime:
    """Return timezone-aware UTC datetime for proper timezone handling in frontends."""
    return datetime.now(timezone.utc)

from .config import get_settings
from typing import AsyncGenerator
from .providers import ProviderType, get_provider_registry, ClaudeProvider


class AgentStatus(str, Enum):
    """Agent status enum."""

    STARTING = "starting"
    RUNNING = "running"
    STOPPED = "stopped"
    FAILED = "failed"


@dataclass
class Agent:
    """Represents a running agent."""

    id: str
    prompt: str
    working_dir: str
    provider: str = "claude"
    model: Optional[str] = None  # e.g. "claude-sonnet-4-6" for model override
    status: AgentStatus = AgentStatus.STARTING
    pid: Optional[int] = None
    started_at: datetime = field(default_factory=utcnow)
    stopped_at: Optional[datetime] = None
    exit_code: Optional[int] = None
    error: Optional[str] = None
    output_buffer: list[str] = field(default_factory=list)
    process: Optional[asyncio.subprocess.Process] = None
    is_chat_mode: bool = False
    message_count: int = 0
    task_title: Optional[str] = None  # Friendly display name for the task
    # Session management fields
    last_activity_at: datetime = field(default_factory=utcnow)
    websocket_connected: bool = False
    disconnect_count: int = 0
    marked_for_cleanup: bool = False

    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "prompt": self.prompt,
            "working_dir": self.working_dir,
            "provider": self.provider,
            "status": self.status.value,
            "pid": self.pid,
            "started_at": self.started_at.isoformat(),
            "stopped_at": self.stopped_at.isoformat() if self.stopped_at else None,
            "exit_code": self.exit_code,
            "error": self.error,
            "output_lines": len(self.output_buffer),
            "task_title": self.task_title,
        }


class AgentManager:
    """Manages agent processes."""

    def __init__(self):
        self.agents: dict[str, Agent] = {}
        self.settings = get_settings()
        self._output_subscribers: dict[str, list[asyncio.Queue]] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    async def launch_agent(
        self,
        prompt: str,
        working_dir: Optional[str] = None,
        agent_id: Optional[str] = None,
        provider: Optional[str] = None,
        task_title: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Agent:
        """
        Launch a new agent with the specified provider.

        Args:
            prompt: The prompt/task for the agent
            working_dir: Working directory for the agent
            agent_id: Optional custom agent ID
            provider: Provider to use (claude, codex, gemini, opencode)
            task_title: Friendly display name for the task

        Returns:
            The created Agent instance
        """
        if len(self.agents) >= self.settings.max_agents:
            raise RuntimeError(f"Maximum number of agents ({self.settings.max_agents}) reached")

        agent_id = agent_id or str(uuid.uuid4())
        working_dir = working_dir or self.settings.default_working_dir
        provider = provider or self.settings.default_provider

        agent = Agent(
            id=agent_id,
            prompt=prompt,
            working_dir=working_dir,
            provider=provider,
            model=model,
            task_title=task_title,
        )

        self.agents[agent_id] = agent
        self._output_subscribers[agent_id] = []

        # Start the agent process
        asyncio.create_task(self._run_agent(agent))

        return agent

    async def _run_agent(self, agent: Agent) -> None:
        """Run the agent process and capture output."""
        try:
            # Get provider and build command
            registry = get_provider_registry()
            try:
                provider_type = ProviderType(agent.provider)
            except ValueError:
                raise RuntimeError(f"Unknown provider: {agent.provider}")

            provider = registry.get_provider(provider_type)

            # Update command from settings if overridden
            custom_command = self.settings.get_provider_command(agent.provider)
            if custom_command:
                provider.config.command = custom_command

            # Discover MCP config from working directory
            mcp_config = None
            if agent.working_dir and isinstance(provider, ClaudeProvider):
                settings_path = os.path.join(
                    os.path.expanduser(agent.working_dir),
                    ".claude", "settings.local.json"
                )
                if os.path.isfile(settings_path):
                    mcp_config = settings_path

            # Build the command (pass model and mcp_config for Claude provider)
            if isinstance(provider, ClaudeProvider):
                cmd = provider.build_command(
                    agent.prompt, agent.working_dir,
                    model=agent.model, mcp_config=mcp_config
                )
            else:
                cmd = provider.build_command(agent.prompt, agent.working_dir)

            # Create the subprocess
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=agent.working_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )

            agent.process = process
            agent.pid = process.pid
            agent.status = AgentStatus.RUNNING

            # Read output line by line
            while True:
                if process.stdout is None:
                    break

                line = await process.stdout.readline()
                if not line:
                    break

                decoded = line.decode("utf-8", errors="replace").rstrip()
                agent.output_buffer.append(decoded)

                # Notify subscribers
                for queue in self._output_subscribers.get(agent.id, []):
                    await queue.put(decoded)

            # Wait for process to complete
            await process.wait()

            agent.exit_code = process.returncode
            agent.stopped_at = utcnow()
            agent.status = AgentStatus.STOPPED if process.returncode == 0 else AgentStatus.FAILED

            if process.returncode != 0:
                agent.error = f"Process exited with code {process.returncode}"

        except Exception as e:
            agent.status = AgentStatus.FAILED
            agent.error = str(e)
            agent.stopped_at = utcnow()

        finally:
            # Notify subscribers that stream is done
            for queue in self._output_subscribers.get(agent.id, []):
                await queue.put(None)

    async def stop_agent(self, agent_id: str) -> Agent:
        """
        Stop a running agent.

        Args:
            agent_id: The ID of the agent to stop

        Returns:
            The updated Agent instance
        """
        agent = self.agents.get(agent_id)
        if not agent:
            raise KeyError(f"Agent {agent_id} not found")

        if agent.status == AgentStatus.RUNNING:
            # Terminate the subprocess if one is running
            if agent.process:
                try:
                    agent.process.terminate()
                    # Give it a moment to terminate gracefully
                    try:
                        await asyncio.wait_for(agent.process.wait(), timeout=5.0)
                    except asyncio.TimeoutError:
                        # Force kill if it doesn't terminate
                        agent.process.kill()
                        await agent.process.wait()
                except ProcessLookupError:
                    pass  # Process already gone

            # Always update status for running agents (including chat mode with no process)
            agent.status = AgentStatus.STOPPED
            agent.stopped_at = utcnow()
            agent.last_activity_at = utcnow()
            agent.websocket_connected = False

            # Mark non-chat agents for immediate cleanup after grace period
            if not agent.is_chat_mode:
                agent.marked_for_cleanup = True

        return agent

    def get_agent(self, agent_id: str) -> Optional[Agent]:
        """Get an agent by ID."""
        return self.agents.get(agent_id)

    def list_agents(self) -> list[Agent]:
        """List all agents."""
        return list(self.agents.values())

    def subscribe_output(self, agent_id: str) -> asyncio.Queue:
        """
        Subscribe to agent output.

        Args:
            agent_id: The ID of the agent

        Returns:
            Queue that will receive output lines
        """
        if agent_id not in self._output_subscribers:
            self._output_subscribers[agent_id] = []

        queue: asyncio.Queue = asyncio.Queue()
        self._output_subscribers[agent_id].append(queue)
        return queue

    def unsubscribe_output(self, agent_id: str, queue: asyncio.Queue) -> None:
        """Remove an output subscription."""
        if agent_id in self._output_subscribers:
            try:
                self._output_subscribers[agent_id].remove(queue)
            except ValueError:
                pass

    def get_output(self, agent_id: str, offset: int = 0, limit: int = 100) -> list[str]:
        """
        Get buffered output for an agent.

        Args:
            agent_id: The ID of the agent
            offset: Starting line offset
            limit: Maximum lines to return

        Returns:
            List of output lines
        """
        agent = self.agents.get(agent_id)
        if not agent:
            return []
        return agent.output_buffer[offset : offset + limit]

    async def launch_chat_agent(
        self,
        working_directory: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> Agent:
        """
        Launch an agent in interactive chat mode.

        Unlike task agents, chat agents:
        - Don't receive an initial prompt upfront
        - Use message-per-request model with --continue for subsequent messages
        - Run until explicitly stopped

        Args:
            working_directory: Working directory for the agent
            provider: Provider to use (claude, codex, gemini, opencode)

        Returns:
            The created Agent instance
        """
        if len(self.agents) >= self.settings.max_agents:
            raise RuntimeError(f"Maximum number of agents ({self.settings.max_agents}) reached")

        agent_id = str(uuid.uuid4())
        working_directory = working_directory or self.settings.default_working_dir
        provider = provider or self.settings.default_provider

        agent = Agent(
            id=agent_id,
            prompt="[Interactive Chat Session]",
            working_dir=working_directory,
            provider=provider,
            is_chat_mode=True,
            status=AgentStatus.RUNNING,
        )

        self.agents[agent_id] = agent
        self._output_subscribers[agent_id] = []

        return agent

    async def send_chat_message(
        self, session_id: str, message: str
    ) -> AsyncGenerator[str, None]:
        """
        Send a message to a chat agent and stream the response.

        Uses the message-per-request model:
        - First message: launches agent with -p <message>
        - Subsequent messages: uses --continue -p <message>

        Args:
            session_id: The chat session ID
            message: The user's message

        Yields:
            Output lines from the agent
        """
        agent = self.agents.get(session_id)
        if not agent:
            yield "Error: Session not found. Please start a new session."
            return

        if not agent.is_chat_mode:
            yield "Error: This session is not in chat mode."
            return

        if agent.status != AgentStatus.RUNNING:
            yield f"Error: Session is not running (status: {agent.status.value}). Please start a new session."
            return

        # Update activity timestamp on message send
        agent.last_activity_at = utcnow()
        agent.marked_for_cleanup = False  # Un-mark if was marked

        # Get provider
        registry = get_provider_registry()
        try:
            provider_type = ProviderType(agent.provider)
        except ValueError:
            yield f"Error: Unknown provider: {agent.provider}"
            return

        provider = registry.get_provider(provider_type)

        # Update command from settings if overridden
        custom_command = self.settings.get_provider_command(agent.provider)
        if custom_command:
            provider.config.command = custom_command

        # Build command based on message count
        if agent.message_count == 0:
            # First message: use build_command
            cmd = provider.build_command(message, agent.working_dir)
        else:
            # Subsequent messages: use --continue (only for Claude)
            if isinstance(provider, ClaudeProvider):
                cmd = provider.build_continue_command(message, agent.working_dir)
            else:
                # Fallback for non-Claude providers
                cmd = provider.build_command(message, agent.working_dir)

        try:
            # Run subprocess and yield output lines
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=agent.working_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )

            agent.process = process
            agent.pid = process.pid

            while True:
                if process.stdout is None:
                    break

                line = await process.stdout.readline()
                if not line:
                    break

                decoded = line.decode("utf-8", errors="replace").rstrip()
                agent.output_buffer.append(decoded)

                # Notify subscribers
                for queue in self._output_subscribers.get(agent.id, []):
                    await queue.put(decoded)

                yield decoded

            # Wait for process to complete
            await process.wait()
            agent.exit_code = process.returncode

            # Increment message count on success
            agent.message_count += 1
            agent.last_activity_at = utcnow()  # Update activity after completion

        except Exception as e:
            yield f"Error: {str(e)}"
            agent.error = str(e)

    async def start_cleanup_task(self) -> None:
        """Start the background cleanup task if not already running."""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_abandoned_sessions())

    async def _cleanup_abandoned_sessions(self) -> None:
        """
        Background task to clean up abandoned chat sessions.

        Runs periodically to identify and remove sessions that:
        1. Have been disconnected longer than temp_disconnect_timeout
        2. Have exceeded abandoned_timeout with no activity
        3. Are stopped task agents (non-chat)

        Two-phase cleanup:
        - Phase 1: Mark sessions exceeding temp_disconnect_timeout
        - Phase 2: Remove sessions exceeding abandoned_timeout or stopped tasks
        """
        settings = self.settings

        while True:
            try:
                await asyncio.sleep(settings.session_cleanup_interval)

                now = utcnow()
                agents_to_cleanup = []

                for agent_id, agent in list(self.agents.items()):
                    # Calculate inactivity duration
                    inactive_duration = (now - agent.last_activity_at).total_seconds()

                    # CASE 1: Task agents that have finished - cleanup after grace period
                    if not agent.is_chat_mode and agent.status in (AgentStatus.STOPPED, AgentStatus.FAILED):
                        # Only cleanup after temp disconnect timeout (give time for output streaming)
                        if inactive_duration > settings.session_temp_disconnect_timeout:
                            agents_to_cleanup.append(agent_id)
                            continue

                    # CASE 2: Chat sessions - graceful two-phase cleanup
                    if agent.is_chat_mode:
                        # Phase 1: Mark disconnected sessions exceeding temp timeout
                        if not agent.websocket_connected and inactive_duration > settings.session_temp_disconnect_timeout:
                            agent.marked_for_cleanup = True

                        # Phase 2: Remove marked sessions exceeding abandoned timeout OR stopped sessions
                        if (agent.marked_for_cleanup and inactive_duration > settings.session_abandoned_timeout) or \
                           (agent.status == AgentStatus.STOPPED and inactive_duration > settings.session_temp_disconnect_timeout):
                            agents_to_cleanup.append(agent_id)

                # Perform cleanup - FIX MEMORY LEAK: Actually remove from dict
                for agent_id in agents_to_cleanup:
                    agent = self.agents.pop(agent_id, None)  # Remove from dict
                    if agent:
                        # Clean up subscribers
                        self._output_subscribers.pop(agent_id, None)
                        inactive_time = (now - agent.last_activity_at).total_seconds()
                        print(f"[CLEANUP] Removed abandoned session: {agent_id} (inactive: {inactive_time:.0f}s, chat_mode: {agent.is_chat_mode})")

            except Exception as e:
                print(f"[ERROR] Cleanup task error: {e}")
                await asyncio.sleep(60)  # Back off on error


# Global agent manager instance
_agent_manager: Optional[AgentManager] = None


def get_agent_manager() -> AgentManager:
    """Get the global agent manager instance."""
    global _agent_manager
    if _agent_manager is None:
        _agent_manager = AgentManager()
    return _agent_manager
