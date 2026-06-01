"""Main chain execution engine."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from .chain_config import ChainDefinition, ChainExecutionConfig, StageDefinition, StageResult
from .chain_registry import get_chain
from .stage_runner import StageRunner
from .config import get_settings

logger = logging.getLogger(__name__)


def _utcnow() -> str:
    """Return ISO-formatted UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def _get_supabase():
    """Get a Supabase client."""
    from supabase import create_client
    settings = get_settings()
    if settings.supabase_url and settings.supabase_service_key:
        return create_client(settings.supabase_url, settings.supabase_service_key)
    raise RuntimeError("Supabase not configured")


class ChainEngine:
    """Orchestrates multi-stage chain execution for tasks."""

    # Track running executions for cancellation
    _running: dict[str, bool] = {}

    @classmethod
    async def execute_chain(
        cls,
        task_id: str,
        chain_type: str,
        config: Optional[ChainExecutionConfig] = None,
        project_id: Optional[str] = None,
    ) -> str:
        """Start a chain execution for a task.

        Args:
            task_id: The task to run the chain for
            chain_type: 'research' or 'development'
            config: Optional execution configuration
            project_id: Optional project ID

        Returns:
            The chain execution ID
        """
        chain_def = get_chain(chain_type)
        config = config or ChainExecutionConfig()
        db = _get_supabase()

        # Load task details
        task_result = db.table("tasks").select("*, projects(id, name, path)").eq("id", task_id).single().execute()
        if not task_result.data:
            raise ValueError(f"Task {task_id} not found")

        task = task_result.data

        # Use project path as working dir if available
        if not config.working_dir:
            project = task.get("projects")
            if project and project.get("path"):
                config.working_dir = project["path"]
            if not project_id and task.get("project_id"):
                project_id = task["project_id"]

        # Look up template ID
        template_result = (
            db.table("chain_templates")
            .select("id")
            .eq("chain_type", chain_type)
            .eq("is_builtin", True)
            .limit(1)
            .execute()
        )
        template_id = template_result.data[0]["id"] if template_result.data else None

        # Create chain_execution record
        execution_data = {
            "template_id": template_id,
            "chain_type": chain_type,
            "task_id": task_id,
            "project_id": project_id,
            "status": "pending",
            "config": {
                "provider": config.provider,
                "model": config.model,
                "working_dir": config.working_dir,
                "domain_context": config.domain_context,
                "system_prompt_prefix": config.system_prompt_prefix,
            },
            "context": {},
            "current_stage_index": 0,
            "total_stages": len(chain_def.stages),
        }
        exec_result = db.table("chain_executions").insert(execution_data).execute()
        execution_id = exec_result.data[0]["id"]

        # Create chain_stages records
        for i, stage in enumerate(chain_def.stages):
            stage_data = {
                "chain_execution_id": execution_id,
                "stage_index": i,
                "stage_name": stage.name,
                "stage_type": stage.stage_type,
                "status": "pending",
                "max_retries": stage.max_qc_iterations if stage.is_qc_gate else 3,
                "result_data": {
                    "is_output_stage": stage.is_output_stage,
                    "is_background": stage.is_background,
                },
            }
            db.table("chain_stages").insert(stage_data).execute()

        # Update task status to in_progress
        db.table("tasks").update({"status": "in_progress"}).eq("id", task_id).execute()

        # Store execution context for task
        task_context = task.get("context") or {}
        task_context["chain"] = {"execution_id": execution_id, "chain_type": chain_type}
        db.table("tasks").update({"context": task_context}).eq("id", task_id).execute()

        # Start the chain execution in the background
        cls._running[execution_id] = True
        asyncio.create_task(cls._run_chain(execution_id, chain_def, config, task))

        return execution_id

    @classmethod
    async def _run_chain(
        cls,
        execution_id: str,
        chain_def: ChainDefinition,
        config: ChainExecutionConfig,
        task: dict,
    ) -> None:
        """Run the chain stages sequentially.

        For QC gate stages, implements a retry loop back to the target stage.
        """
        db = _get_supabase()
        accumulated_context: dict[str, str] = {}

        try:
            # Mark execution as running
            db.table("chain_executions").update({
                "status": "running",
                "started_at": _utcnow(),
            }).eq("id", execution_id).execute()

            task_title = task.get("title", "")
            task_description = task.get("description", "") or ""
            task_context = task.get("context", {})
            task_id = task["id"]

            stage_index = 0
            stages = chain_def.stages

            while stage_index < len(stages):
                # Check for cancellation
                if not cls._running.get(execution_id, False):
                    db.table("chain_executions").update({
                        "status": "cancelled",
                        "completed_at": _utcnow(),
                    }).eq("id", execution_id).execute()
                    return

                stage = stages[stage_index]

                # Update current stage index
                db.table("chain_executions").update({
                    "current_stage_index": stage_index,
                }).eq("id", execution_id).execute()

                # Run the stage (or QC loop)
                if stage.is_qc_gate:
                    result = await cls._run_qc_loop(
                        execution_id, stage, stages, stage_index,
                        task_title, task_description, task_context,
                        accumulated_context, config, db,
                    )
                    if not result.success:
                        raise RuntimeError(f"QC loop failed: {result.error or 'max retries exceeded'}")
                    accumulated_context[stage.name] = result.output
                else:
                    result = await cls._run_single_stage(
                        execution_id, stage, stage_index,
                        task_title, task_description, task_context,
                        accumulated_context, config, db,
                    )
                    if not result.success:
                        raise RuntimeError(f"Stage {stage.name} failed: {result.error}")
                    accumulated_context[stage.name] = result.output

                logger.info(f"Stage '{stage.name}' completed. Output length: {len(result.output)} chars")

                # Update task progress
                progress = int(((stage_index + 1) / len(stages)) * 100)
                db.table("tasks").update({"progress": progress}).eq("id", task_id).execute()

                stage_index += 1

            # Chain completed successfully
            # Find the designated output stage result
            final_result = "Chain completed"
            output_stage_name = None
            for stage in stages:
                if stage.is_output_stage:
                    output_stage_name = stage.name
                    break

            if output_stage_name and accumulated_context.get(output_stage_name):
                final_result = accumulated_context[output_stage_name]
            else:
                # Fallback: use last non-background stage output
                for stage in reversed(stages):
                    if not stage.is_background and accumulated_context.get(stage.name):
                        final_result = accumulated_context[stage.name]
                        break

            logger.info(f"Output stage: {output_stage_name}, final_result length: {len(final_result)} chars")
            logger.info(f"Final result preview: {final_result[:200]}")

            db.table("chain_executions").update({
                "status": "completed",
                "context": accumulated_context,
                "completed_at": _utcnow(),
            }).eq("id", execution_id).execute()

            # Update task as done
            db.table("tasks").update({
                "status": "done",
                "progress": 100,
                "result": final_result,
            }).eq("id", task_id).execute()

        except Exception as e:
            error_msg = str(e)
            db.table("chain_executions").update({
                "status": "failed",
                "error_message": error_msg,
                "completed_at": _utcnow(),
            }).eq("id", execution_id).execute()

            # Update task as failed
            db.table("tasks").update({
                "status": "failed",
                "error_message": f"Chain execution failed: {error_msg}",
            }).eq("id", task.get("id", "")).execute()

        finally:
            cls._running.pop(execution_id, None)

    @classmethod
    async def _run_single_stage(
        cls,
        execution_id: str,
        stage: StageDefinition,
        stage_index: int,
        task_title: str,
        task_description: str,
        task_context: dict,
        accumulated_context: dict,
        config: ChainExecutionConfig,
        db,
    ) -> StageResult:
        """Run a single non-QC stage."""
        # Get the stage record
        stage_records = (
            db.table("chain_stages")
            .select("*")
            .eq("chain_execution_id", execution_id)
            .eq("stage_index", stage_index)
            .execute()
        )
        stage_record_id = stage_records.data[0]["id"] if stage_records.data else None

        # Mark stage as running
        if stage_record_id:
            db.table("chain_stages").update({
                "status": "running",
                "started_at": _utcnow(),
            }).eq("id", stage_record_id).execute()

        # Run the stage
        result = await StageRunner.run_stage(
            stage=stage,
            task_title=task_title,
            task_description=task_description,
            task_context=task_context,
            accumulated_context=accumulated_context,
            config=config,
            execution_id=execution_id,
        )

        # Update stage record
        if stage_record_id:
            update_data = {
                "status": "completed" if result.success else "failed",
                "agent_id": result.agent_id,
                "result": result.output[:50000] if result.output and len(result.output) > 50000 else result.output,
                "completed_at": _utcnow(),
            }
            if result.error:
                update_data["error_message"] = result.error
            db.table("chain_stages").update(update_data).eq("id", stage_record_id).execute()

        return result

    @classmethod
    async def _run_qc_loop(
        cls,
        execution_id: str,
        qc_stage: StageDefinition,
        all_stages: list[StageDefinition],
        qc_stage_index: int,
        task_title: str,
        task_description: str,
        task_context: dict,
        accumulated_context: dict,
        config: ChainExecutionConfig,
        db,
    ) -> StageResult:
        """Run a QC gate with retry loop.

        If QC fails, re-runs the target stage (e.g., implementation) with QC feedback,
        then re-runs QC. Repeats up to max_qc_iterations.
        """
        # Find the target stage to retry on QC failure
        target_stage = None
        target_index = None
        if qc_stage.retry_target_stage:
            for i, s in enumerate(all_stages):
                if s.name == qc_stage.retry_target_stage:
                    target_stage = s
                    target_index = i
                    break

        for iteration in range(qc_stage.max_qc_iterations):
            # Run QC stage
            qc_result = await cls._run_single_stage(
                execution_id, qc_stage, qc_stage_index,
                task_title, task_description, task_context,
                accumulated_context, config, db,
            )

            if not qc_result.success:
                return qc_result

            # Parse QC result to check pass/fail
            passed = cls._parse_qc_result(qc_result.output)

            if passed:
                return qc_result

            # QC failed - extract feedback and retry target stage
            if target_stage is None or target_index is None:
                return StageResult(
                    success=False,
                    output=qc_result.output,
                    error="QC failed but no retry target stage configured",
                )

            # Add QC feedback to context for the retry
            accumulated_context["qc_feedback"] = qc_result.output

            # Update QC stage retry count
            stage_records = (
                db.table("chain_stages")
                .select("*")
                .eq("chain_execution_id", execution_id)
                .eq("stage_index", qc_stage_index)
                .execute()
            )
            if stage_records.data:
                db.table("chain_stages").update({
                    "retry_count": iteration + 1,
                    "status": "pending",
                }).eq("id", stage_records.data[0]["id"]).execute()

            # Re-run the target stage
            retry_result = await cls._run_single_stage(
                execution_id, target_stage, target_index,
                task_title, task_description, task_context,
                accumulated_context, config, db,
            )

            if not retry_result.success:
                return retry_result

            # Update accumulated context with new implementation
            accumulated_context[target_stage.name] = retry_result.output
            # Remove qc_feedback after it's been addressed
            accumulated_context.pop("qc_feedback", None)

        return StageResult(
            success=False,
            output="",
            error=f"QC gate failed after {qc_stage.max_qc_iterations} iterations",
        )

    @staticmethod
    def _parse_qc_result(output: str) -> bool:
        """Parse QC stage output to determine pass/fail.

        Looks for a JSON block with {"passed": true/false}.
        Falls back to heuristic if no JSON found.
        """
        # Try to find JSON block
        try:
            # Look for ```json ... ``` block
            import re
            json_match = re.search(r'```json\s*\n?(.*?)\n?```', output, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group(1))
                return bool(data.get("passed", False))

            # Try parsing the whole output as JSON
            data = json.loads(output)
            return bool(data.get("passed", False))
        except (json.JSONDecodeError, AttributeError):
            pass

        # Heuristic fallback: look for pass/fail indicators
        lower = output.lower()
        if "passed" in lower and "true" in lower:
            return True
        if '"passed": true' in lower or '"passed":true' in lower:
            return True

        return False

    @classmethod
    async def stop_chain(cls, execution_id: str) -> dict:
        """Stop a running chain execution.

        Args:
            execution_id: The chain execution ID

        Returns:
            Status dict
        """
        cls._running[execution_id] = False
        db = _get_supabase()

        # Mark any running stages as cancelled
        db.table("chain_stages").update({
            "status": "skipped",
        }).eq("chain_execution_id", execution_id).eq("status", "running").execute()

        db.table("chain_stages").update({
            "status": "skipped",
        }).eq("chain_execution_id", execution_id).eq("status", "pending").execute()

        return {"success": True, "message": "Chain stop signal sent"}

    @classmethod
    async def get_status(cls, execution_id: str) -> dict:
        """Get the current status of a chain execution.

        Args:
            execution_id: The chain execution ID

        Returns:
            Execution details with stages
        """
        db = _get_supabase()

        execution = (
            db.table("chain_executions")
            .select("*")
            .eq("id", execution_id)
            .single()
            .execute()
        )

        if not execution.data:
            raise ValueError(f"Execution {execution_id} not found")

        stages = (
            db.table("chain_stages")
            .select("*")
            .eq("chain_execution_id", execution_id)
            .order("stage_index")
            .execute()
        )

        return {
            "execution": execution.data,
            "stages": stages.data or [],
        }
