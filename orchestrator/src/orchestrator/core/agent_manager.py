"""Agent process management."""

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

from .config import get_settings


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
    status: AgentStatus = AgentStatus.STARTING
    pid: Optional[int] = None
    started_at: datetime = field(default_factory=datetime.utcnow)
    stopped_at: Optional[datetime] = None
    exit_code: Optional[int] = None
    error: Optional[str] = None
    output_buffer: list[str] = field(default_factory=list)
    process: Optional[asyncio.subprocess.Process] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "prompt": self.prompt,
            "working_dir": self.working_dir,
            "status": self.status.value,
            "pid": self.pid,
            "started_at": self.started_at.isoformat(),
            "stopped_at": self.stopped_at.isoformat() if self.stopped_at else None,
            "exit_code": self.exit_code,
            "error": self.error,
            "output_lines": len(self.output_buffer),
        }


class AgentManager:
    """Manages agent processes."""

    def __init__(self):
        self.agents: dict[str, Agent] = {}
        self.settings = get_settings()
        self._output_subscribers: dict[str, list[asyncio.Queue]] = {}

    async def launch_agent(
        self,
        prompt: str,
        working_dir: Optional[str] = None,
        agent_id: Optional[str] = None,
    ) -> Agent:
        """
        Launch a new Claude agent.

        Args:
            prompt: The prompt/task for the agent
            working_dir: Working directory for the agent
            agent_id: Optional custom agent ID

        Returns:
            The created Agent instance
        """
        if len(self.agents) >= self.settings.max_agents:
            raise RuntimeError(f"Maximum number of agents ({self.settings.max_agents}) reached")

        agent_id = agent_id or str(uuid.uuid4())
        working_dir = working_dir or self.settings.default_working_dir

        agent = Agent(
            id=agent_id,
            prompt=prompt,
            working_dir=working_dir,
        )

        self.agents[agent_id] = agent
        self._output_subscribers[agent_id] = []

        # Start the agent process
        asyncio.create_task(self._run_agent(agent))

        return agent

    async def _run_agent(self, agent: Agent) -> None:
        """Run the agent process and capture output."""
        try:
            # Create the subprocess
            process = await asyncio.create_subprocess_exec(
                self.settings.claude_command,
                "-p",
                agent.prompt,
                "--dangerously-skip-permissions",
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
            agent.stopped_at = datetime.utcnow()
            agent.status = AgentStatus.STOPPED if process.returncode == 0 else AgentStatus.FAILED

            if process.returncode != 0:
                agent.error = f"Process exited with code {process.returncode}"

        except Exception as e:
            agent.status = AgentStatus.FAILED
            agent.error = str(e)
            agent.stopped_at = datetime.utcnow()

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

        if agent.process and agent.status == AgentStatus.RUNNING:
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

            agent.status = AgentStatus.STOPPED
            agent.stopped_at = datetime.utcnow()

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


# Global agent manager instance
_agent_manager: Optional[AgentManager] = None


def get_agent_manager() -> AgentManager:
    """Get the global agent manager instance."""
    global _agent_manager
    if _agent_manager is None:
        _agent_manager = AgentManager()
    return _agent_manager
