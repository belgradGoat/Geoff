"""Agent CRUD API endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..core.agent_manager import get_agent_manager, AgentManager
from ..core.security import verify_api_key

router = APIRouter(prefix="/api/agents", tags=["agents"])


class LaunchAgentRequest(BaseModel):
    """Request body for launching an agent."""

    prompt: str
    working_dir: Optional[str] = None
    agent_id: Optional[str] = None


class AgentResponse(BaseModel):
    """Agent response model."""

    id: str
    prompt: str
    working_dir: str
    status: str
    pid: Optional[int] = None
    started_at: str
    stopped_at: Optional[str] = None
    exit_code: Optional[int] = None
    error: Optional[str] = None
    output_lines: int = 0


class AgentListResponse(BaseModel):
    """Response for listing agents."""

    agents: list[AgentResponse]
    count: int


class AgentOutputResponse(BaseModel):
    """Response for agent output."""

    lines: list[str]
    total: int
    offset: int


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def launch_agent(
    request: LaunchAgentRequest,
    _: str = Depends(verify_api_key),
    manager: AgentManager = Depends(get_agent_manager),
) -> AgentResponse:
    """Launch a new Claude agent."""
    try:
        agent = await manager.launch_agent(
            prompt=request.prompt,
            working_dir=request.working_dir,
            agent_id=request.agent_id,
        )
        return AgentResponse(**agent.to_dict())
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))


@router.get("", response_model=AgentListResponse)
async def list_agents(
    _: str = Depends(verify_api_key),
    manager: AgentManager = Depends(get_agent_manager),
) -> AgentListResponse:
    """List all agents."""
    agents = manager.list_agents()
    return AgentListResponse(
        agents=[AgentResponse(**a.to_dict()) for a in agents],
        count=len(agents),
    )


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    _: str = Depends(verify_api_key),
    manager: AgentManager = Depends(get_agent_manager),
) -> AgentResponse:
    """Get a specific agent by ID."""
    agent = manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return AgentResponse(**agent.to_dict())


@router.delete("/{agent_id}", response_model=AgentResponse)
async def stop_agent(
    agent_id: str,
    _: str = Depends(verify_api_key),
    manager: AgentManager = Depends(get_agent_manager),
) -> AgentResponse:
    """Stop a running agent."""
    try:
        agent = await manager.stop_agent(agent_id)
        return AgentResponse(**agent.to_dict())
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")


@router.get("/{agent_id}/output", response_model=AgentOutputResponse)
async def get_agent_output(
    agent_id: str,
    offset: int = 0,
    limit: int = 100,
    _: str = Depends(verify_api_key),
    manager: AgentManager = Depends(get_agent_manager),
) -> AgentOutputResponse:
    """Get buffered output for an agent."""
    agent = manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    lines = manager.get_output(agent_id, offset=offset, limit=limit)
    return AgentOutputResponse(
        lines=lines,
        total=len(agent.output_buffer),
        offset=offset,
    )
