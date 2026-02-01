"""Project management API endpoints."""

import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import create_client

from ..core.security import verify_api_key
from ..core.config import get_settings

router = APIRouter(prefix="/api/projects", tags=["projects"])

# Project markers - files that indicate a directory is a code project
PROJECT_MARKERS = [
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "Gemfile",
    "composer.json",
    "CMakeLists.txt",
    "Makefile",
    ".git",
]


def get_supabase_client():
    """Get Supabase client."""
    settings = get_settings()
    if settings.supabase_url and settings.supabase_service_key:
        return create_client(settings.supabase_url, settings.supabase_service_key)
    return None


class ProjectResponse(BaseModel):
    """Project response model."""
    id: str
    name: str
    path: str
    description: Optional[str] = None
    is_active: bool = True


class ProjectListResponse(BaseModel):
    """Response for listing projects."""
    projects: list[ProjectResponse]
    count: int


class ScannedProject(BaseModel):
    """A project found during filesystem scan."""
    name: str
    path: str
    markers: list[str]
    exists_in_db: bool = False
    db_id: Optional[str] = None


class ScanResponse(BaseModel):
    """Response for scanning directories."""
    base_path: str
    projects: list[ScannedProject]
    count: int


class ScanRequest(BaseModel):
    """Request for scanning a directory."""
    base_path: str


class CreateProjectRequest(BaseModel):
    """Request for creating a project."""
    name: str
    path: str
    description: Optional[str] = None


class SyncRequest(BaseModel):
    """Request to sync scanned projects to database."""
    base_path: str
    project_paths: Optional[list[str]] = None  # If None, sync all found


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    _: str = Depends(verify_api_key),
) -> ProjectListResponse:
    """List all projects from database."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    result = supabase.table("projects").select("*").eq("is_active", True).order("name").execute()

    projects = [
        ProjectResponse(
            id=p["id"],
            name=p["name"],
            path=p["path"],
            description=p.get("description"),
            is_active=p.get("is_active", True),
        )
        for p in result.data
    ]

    return ProjectListResponse(projects=projects, count=len(projects))


@router.post("/scan", response_model=ScanResponse)
async def scan_directory(
    request: ScanRequest,
    _: str = Depends(verify_api_key),
) -> ScanResponse:
    """Scan a directory for code projects."""
    base_path = os.path.expanduser(request.base_path)

    if not os.path.isdir(base_path):
        raise HTTPException(status_code=400, detail=f"Directory not found: {base_path}")

    # Get existing projects from database
    existing_paths = {}
    supabase = get_supabase_client()
    if supabase:
        result = supabase.table("projects").select("id, path").execute()
        existing_paths = {p["path"]: p["id"] for p in result.data}

    # Scan directory
    projects = []
    try:
        for entry in os.scandir(base_path):
            if not entry.is_dir() or entry.name.startswith("."):
                continue

            # Check for project markers
            markers = []
            for marker in PROJECT_MARKERS:
                marker_path = os.path.join(entry.path, marker)
                if os.path.exists(marker_path):
                    markers.append(marker)

            if markers:
                full_path = entry.path
                projects.append(ScannedProject(
                    name=entry.name,
                    path=full_path,
                    markers=markers,
                    exists_in_db=full_path in existing_paths,
                    db_id=existing_paths.get(full_path),
                ))
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {base_path}")

    # Sort by name
    projects.sort(key=lambda p: p.name.lower())

    return ScanResponse(
        base_path=base_path,
        projects=projects,
        count=len(projects),
    )


@router.post("/sync", response_model=ProjectListResponse)
async def sync_projects(
    request: SyncRequest,
    _: str = Depends(verify_api_key),
) -> ProjectListResponse:
    """Sync scanned projects to database."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    # First scan the directory
    base_path = os.path.expanduser(request.base_path)
    if not os.path.isdir(base_path):
        raise HTTPException(status_code=400, detail=f"Directory not found: {base_path}")

    # Get existing projects
    result = supabase.table("projects").select("id, path").execute()
    existing_paths = {p["path"]: p["id"] for p in result.data}

    # Scan and create new projects
    created = []
    for entry in os.scandir(base_path):
        if not entry.is_dir() or entry.name.startswith("."):
            continue

        # Check for project markers
        has_marker = any(
            os.path.exists(os.path.join(entry.path, marker))
            for marker in PROJECT_MARKERS
        )

        if not has_marker:
            continue

        full_path = entry.path

        # Skip if filtering and not in list
        if request.project_paths and full_path not in request.project_paths:
            continue

        # Skip if already exists
        if full_path in existing_paths:
            continue

        # Create project
        result = supabase.table("projects").insert({
            "name": entry.name,
            "path": full_path,
        }).execute()

        if result.data:
            created.append(ProjectResponse(
                id=result.data[0]["id"],
                name=result.data[0]["name"],
                path=result.data[0]["path"],
                description=result.data[0].get("description"),
                is_active=result.data[0].get("is_active", True),
            ))

    return ProjectListResponse(projects=created, count=len(created))


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    request: CreateProjectRequest,
    _: str = Depends(verify_api_key),
) -> ProjectResponse:
    """Create a single project."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    # Verify path exists
    path = os.path.expanduser(request.path)
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail=f"Directory not found: {path}")

    try:
        result = supabase.table("projects").insert({
            "name": request.name,
            "path": path,
            "description": request.description,
        }).execute()

        p = result.data[0]
        return ProjectResponse(
            id=p["id"],
            name=p["name"],
            path=p["path"],
            description=p.get("description"),
            is_active=p.get("is_active", True),
        )
    except Exception as e:
        if "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Project with this path already exists")
        raise HTTPException(status_code=500, detail=str(e))
