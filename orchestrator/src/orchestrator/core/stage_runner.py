"""Runs a single chain stage via the agent manager."""

import asyncio
from typing import Optional

from .agent_manager import get_agent_manager, AgentStatus
from .chain_config import StageDefinition, StageResult, ChainExecutionConfig
from .prompt_builder import PromptBuilder


class StageRunner:
    """Executes a single stage by launching a CLI agent and waiting for completion."""

    @staticmethod
    async def run_stage(
        stage: StageDefinition,
        task_title: str,
        task_description: str,
        task_context: dict,
        accumulated_context: dict,
        config: ChainExecutionConfig,
        execution_id: str,
    ) -> StageResult:
        """Run a single stage.

        1. Build the prompt
        2. Launch a CLI agent
        3. Wait for completion
        4. Return the result

        Args:
            stage: Stage definition
            task_title: The task title
            task_description: The task description
            task_context: The task context dict
            accumulated_context: Results from prior stages
            config: Chain execution configuration
            execution_id: The chain execution ID (for tracking)

        Returns:
            StageResult with success status and output
        """
        # Build the prompt
        prompt = PromptBuilder.build_prompt(
            stage=stage,
            task_title=task_title,
            task_description=task_description,
            task_context=task_context,
            accumulated_context=accumulated_context,
            config=config,
        )

        # Launch agent
        manager = get_agent_manager()
        agent_task_title = f"[Chain:{execution_id[:8]}] {stage.name}"

        try:
            agent = await manager.launch_agent(
                prompt=prompt,
                working_dir=config.working_dir,
                provider=config.provider,
                task_title=agent_task_title,
            )
        except Exception as e:
            return StageResult(
                success=False,
                output="",
                error=f"Failed to launch agent: {e}",
            )

        # Wait for agent completion by polling
        result = await StageRunner._wait_for_agent(agent.id, manager)

        return StageResult(
            success=result["success"],
            output=result["output"],
            agent_id=agent.id,
            error=result.get("error"),
        )

    @staticmethod
    async def _wait_for_agent(
        agent_id: str,
        manager,
        poll_interval: float = 2.0,
        timeout: float = 3600.0,
    ) -> dict:
        """Wait for an agent to complete by polling its status.

        Args:
            agent_id: The agent ID to monitor
            manager: AgentManager instance
            poll_interval: Seconds between polls
            timeout: Maximum seconds to wait

        Returns:
            Dict with success, output, and optional error
        """
        elapsed = 0.0

        while elapsed < timeout:
            agent = manager.get_agent(agent_id)
            if not agent:
                return {
                    "success": False,
                    "output": "",
                    "error": "Agent disappeared from manager",
                }

            if agent.status in (AgentStatus.STOPPED, AgentStatus.FAILED):
                output = "\n".join(agent.output_buffer)
                success = agent.status == AgentStatus.STOPPED and agent.exit_code == 0
                error = agent.error if not success else None
                return {
                    "success": success,
                    "output": output,
                    "error": error,
                }

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        # Timeout - stop the agent
        try:
            await manager.stop_agent(agent_id)
        except Exception:
            pass

        agent = manager.get_agent(agent_id)
        output = "\n".join(agent.output_buffer) if agent else ""
        return {
            "success": False,
            "output": output,
            "error": f"Stage timed out after {timeout}s",
        }
