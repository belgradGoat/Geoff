"""Agent CRUD API endpoints."""

import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import create_client

from ..core.agent_manager import get_agent_manager, AgentManager
from ..core.security import verify_api_key
from ..core.config import get_settings

router = APIRouter(prefix="/api/agents", tags=["agents"])


def get_supabase_client():
    """Get Supabase client for project lookups."""
    settings = get_settings()
    if settings.supabase_url and settings.supabase_service_key:
        return create_client(settings.supabase_url, settings.supabase_service_key)
    return None


class LaunchAgentRequest(BaseModel):
    """Request body for launching an agent."""

    prompt: str
    working_dir: Optional[str] = None
    project_id: Optional[str] = None
    agent_id: Optional[str] = None
    provider: Optional[str] = None


class AgentResponse(BaseModel):
    """Agent response model."""

    id: str
    prompt: str
    working_dir: str
    provider: str = "claude"
    status: str
    pid: Optional[int] = None
    started_at: str
    stopped_at: Optional[str] = None
    exit_code: Optional[int] = None
    error: Optional[str] = None
    output_lines: int = 0


class ProviderInfo(BaseModel):
    """Provider information for UI display."""

    id: str
    name: str
    description: str
    has_free_tier: bool
    mcp_support: bool
    website: str


class ProvidersResponse(BaseModel):
    """Response for listing providers."""

    providers: list[ProviderInfo]
    default: str


class AgentListResponse(BaseModel):
    """Response for listing agents."""

    agents: list[AgentResponse]
    count: int


class AgentOutputResponse(BaseModel):
    """Response for agent output."""

    lines: list[str]
    total: int
    offset: int


@router.get("/providers", response_model=ProvidersResponse)
async def list_providers(
    _: str = Depends(verify_api_key),
) -> ProvidersResponse:
    """List available AI providers."""
    from ..core.providers import get_provider_registry

    settings = get_settings()
    registry = get_provider_registry()
    providers = registry.list_providers()

    return ProvidersResponse(
        providers=[
            ProviderInfo(
                id=p.id,
                name=p.name,
                description=p.description,
                has_free_tier=p.has_free_tier,
                mcp_support=p.mcp_support,
                website=p.website,
            )
            for p in providers
        ],
        default=settings.default_provider,
    )


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def launch_agent(
    request: LaunchAgentRequest,
    _: str = Depends(verify_api_key),
    manager: AgentManager = Depends(get_agent_manager),
) -> AgentResponse:
    """Launch a new agent with the specified provider."""
    try:
        working_dir = request.working_dir

        # If project_id provided, fetch project path from Supabase
        if request.project_id and not working_dir:
            supabase = get_supabase_client()
            if supabase:
                result = supabase.table("projects").select("path").eq("id", request.project_id).single().execute()
                if result.data:
                    working_dir = result.data["path"]

        agent = await manager.launch_agent(
            prompt=request.prompt,
            working_dir=working_dir,
            agent_id=request.agent_id,
            provider=request.provider,
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
