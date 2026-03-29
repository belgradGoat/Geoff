"""Chain orchestration API endpoints."""

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel

from ..core.chain_engine import ChainEngine
from ..core.chain_config import ChainExecutionConfig
from ..core.chain_registry import list_chain_types
from ..core.security import verify_api_key
from ..core.config import get_settings

router = APIRouter(prefix="/api/chains", tags=["chains"])


# Request/Response models

class ExecuteChainRequest(BaseModel):
    """Request to start a chain execution."""
    task_id: str
    chain_type: str  # 'research' or 'development'
    project_id: Optional[str] = None
    config: Optional[dict] = None  # Optional ChainExecutionConfig fields


class ExecuteChainResponse(BaseModel):
    """Response after starting a chain execution."""
    execution_id: str
    chain_type: str
    task_id: str
    status: str


class ChainTemplateResponse(BaseModel):
    """A chain template summary."""
    chain_type: str
    name: str
    stages: list[dict]
    total_stages: int


class ChainTemplatesResponse(BaseModel):
    """Response for listing chain templates."""
    templates: list[ChainTemplateResponse]


class StopChainResponse(BaseModel):
    """Response for stopping a chain."""
    success: bool
    message: str


# Endpoints

@router.get("/templates", response_model=ChainTemplatesResponse)
async def get_templates(
    _: str = Depends(verify_api_key),
) -> ChainTemplatesResponse:
    """List available chain types/templates."""
    try:
        templates = list_chain_types()
        return ChainTemplatesResponse(
            templates=[ChainTemplateResponse(**t) for t in templates]
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/execute", response_model=ExecuteChainResponse, status_code=status.HTTP_201_CREATED)
async def execute_chain(
    request: ExecuteChainRequest,
    _: str = Depends(verify_api_key),
) -> ExecuteChainResponse:
    """Start a chain execution for a task."""
    try:
        # Build config from request
        config = ChainExecutionConfig()
        if request.config:
            if "provider" in request.config:
                config.provider = request.config["provider"]
            if "working_dir" in request.config:
                config.working_dir = request.config["working_dir"]
            if "domain_context" in request.config:
                config.domain_context = request.config["domain_context"]
            if "system_prompt_prefix" in request.config:
                config.system_prompt_prefix = request.config["system_prompt_prefix"]
            if "stage_overrides" in request.config:
                config.stage_overrides = request.config["stage_overrides"]
            if "model" in request.config:
                config.model = request.config["model"]

        # Apply OSINT chain defaults if not explicitly overridden
        if request.chain_type == "osint":
            settings = get_settings()
            if not config.working_dir:
                config.working_dir = settings.osint_working_dir
            if not config.model:
                config.model = settings.osint_default_model

        execution_id = await ChainEngine.execute_chain(
            task_id=request.task_id,
            chain_type=request.chain_type,
            config=config,
            project_id=request.project_id,
        )

        return ExecuteChainResponse(
            execution_id=execution_id,
            chain_type=request.chain_type,
            task_id=request.task_id,
            status="pending",
        )
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))


@router.get("/executions")
async def list_executions(
    project_id: Optional[str] = None,
    task_id: Optional[str] = None,
    chain_status: Optional[str] = None,
    limit: int = 50,
    _: str = Depends(verify_api_key),
) -> dict:
    """List chain executions with optional filters."""
    try:
        from supabase import create_client
        settings = get_settings()
        db = create_client(settings.supabase_url, settings.supabase_service_key)

        query = db.table("chain_executions").select("*").order("created_at", desc=True).limit(limit)

        if project_id:
            query = query.eq("project_id", project_id)
        if task_id:
            query = query.eq("task_id", task_id)
        if chain_status:
            query = query.eq("status", chain_status)

        result = query.execute()
        return {"executions": result.data or [], "count": len(result.data or [])}
    except Exception as e:
        # Table may not exist yet if migration hasn't been run
        print(f"[CHAINS] Error listing executions: {e}")
        return {"executions": [], "count": 0}


@router.get("/executions/{execution_id}")
async def get_execution(
    execution_id: str,
    _: str = Depends(verify_api_key),
) -> dict:
    """Get a chain execution with its stages."""
    try:
        return await ChainEngine.get_status(execution_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/executions/{execution_id}/stop", response_model=StopChainResponse)
async def stop_execution(
    execution_id: str,
    _: str = Depends(verify_api_key),
) -> StopChainResponse:
    """Stop a running chain execution."""
    result = await ChainEngine.stop_chain(execution_id)
    return StopChainResponse(**result)


@router.websocket("/executions/{execution_id}/stream")
async def stream_execution(
    websocket: WebSocket,
    execution_id: str,
):
    """Stream real-time chain execution events via WebSocket."""
    # Verify API key from query params
    api_key = websocket.query_params.get("api_key", "")
    settings = get_settings()
    if api_key != settings.api_key:
        await websocket.close(code=4003, reason="Invalid API key")
        return

    await websocket.accept()

    try:
        last_stages_state: dict[str, str] = {}

        while True:
            try:
                status_data = await ChainEngine.get_status(execution_id)
            except ValueError:
                await websocket.send_json({"type": "error", "message": "Execution not found"})
                break

            execution = status_data["execution"]
            stages = status_data["stages"]

            # Check for stage status changes
            for stage in stages:
                stage_id = stage["id"]
                current_status = stage["status"]
                if last_stages_state.get(stage_id) != current_status:
                    await websocket.send_json({
                        "type": "stage_update",
                        "stage": {
                            "id": stage_id,
                            "stage_name": stage["stage_name"],
                            "stage_type": stage["stage_type"],
                            "stage_index": stage["stage_index"],
                            "status": current_status,
                            "agent_id": stage.get("agent_id"),
                            "error_message": stage.get("error_message"),
                            "retry_count": stage.get("retry_count", 0),
                        },
                    })
                    last_stages_state[stage_id] = current_status

            # Send overall execution status
            await websocket.send_json({
                "type": "execution_update",
                "execution": {
                    "id": execution["id"],
                    "status": execution["status"],
                    "current_stage_index": execution["current_stage_index"],
                    "total_stages": execution["total_stages"],
                    "error_message": execution.get("error_message"),
                },
            })

            # If execution is done, send final event and close
            if execution["status"] in ("completed", "failed", "cancelled"):
                await websocket.send_json({
                    "type": "done",
                    "status": execution["status"],
                })
                break

            # Send heartbeat
            await websocket.send_json({"type": "heartbeat"})
            await asyncio.sleep(3)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
