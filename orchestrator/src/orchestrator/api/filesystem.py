"""Filesystem browsing API endpoints."""

import os
import mimetypes
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from ..core.security import verify_api_key
from ..core.allowed_paths import (
    get_allowed_paths,
    set_allowed_paths,
    add_allowed_path,
    remove_allowed_path,
    is_path_allowed,
    get_allowed_roots,
)

router = APIRouter(prefix="/api/filesystem", tags=["filesystem"])


def validate_path_access(path: Path) -> None:
    """Raise HTTPException if path is not within allowed directories."""
    if not is_path_allowed(str(path)):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Path is outside allowed directories."
        )

# Maximum file size to read (5MB)
MAX_FILE_SIZE = 5 * 1024 * 1024

# Text file extensions we'll read
TEXT_EXTENSIONS = {
    '.txt', '.md', '.py', '.js', '.ts', '.tsx', '.jsx', '.json', '.yaml', '.yml',
    '.html', '.css', '.scss', '.less', '.xml', '.svg', '.sh', '.bash', '.zsh',
    '.env', '.gitignore', '.dockerignore', '.editorconfig', '.prettierrc',
    '.eslintrc', '.toml', '.ini', '.cfg', '.conf', '.sql', '.graphql',
    '.rs', '.go', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp',
    '.rb', '.php', '.pl', '.r', '.scala', '.lua', '.vim', '.fish',
    '.makefile', '.dockerfile', '.tf', '.hcl', '.prisma',
}


class FileEntry(BaseModel):
    """A file or directory entry."""
    name: str
    path: str
    is_dir: bool
    is_file: bool
    size: Optional[int] = None
    modified: Optional[str] = None
    extension: Optional[str] = None


class BrowseResponse(BaseModel):
    """Response for browsing a directory."""
    current_path: str
    parent_path: Optional[str]
    entries: list[FileEntry]
    total_files: int
    total_dirs: int


class BrowseRequest(BaseModel):
    """Request for browsing a directory."""
    path: Optional[str] = None
    show_hidden: bool = False
    files_only: bool = False
    dirs_only: bool = False


class FileContentResponse(BaseModel):
    """Response for reading file content."""
    path: str
    name: str
    size: int
    modified: str
    content: str
    is_truncated: bool
    mime_type: Optional[str]


class ReadFileRequest(BaseModel):
    """Request for reading a file."""
    path: str
    max_lines: Optional[int] = None


@router.post("/browse", response_model=BrowseResponse)
async def browse_directory(
    request: BrowseRequest,
    _: str = Depends(verify_api_key),
) -> BrowseResponse:
    """Browse a directory, listing files and subdirectories."""
    allowed_paths = get_allowed_paths()

    if not request.path:
        # If allowed paths are configured, use the first one as default
        if allowed_paths:
            path = Path(allowed_paths[0])
        else:
            path = Path.home()
    else:
        path = Path(os.path.expanduser(request.path))

    # Validate path access
    validate_path_access(path)

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")

    if not path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")

    # Only show parent path if it's also within allowed directories
    if path.parent != path and is_path_allowed(str(path.parent)):
        parent_path = str(path.parent)
    else:
        parent_path = None

    entries = []
    total_files = 0
    total_dirs = 0

    try:
        for entry in sorted(path.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            # Skip hidden files unless requested
            if entry.name.startswith('.') and not request.show_hidden:
                continue

            is_dir = entry.is_dir()
            is_file = entry.is_file()

            # Apply filters
            if request.files_only and is_dir:
                continue
            if request.dirs_only and is_file:
                continue

            if is_dir:
                total_dirs += 1
            if is_file:
                total_files += 1

            # Get file stats
            try:
                stat = entry.stat()
                size = stat.st_size if is_file else None
                modified = datetime.fromtimestamp(stat.st_mtime).isoformat()
            except (OSError, PermissionError):
                size = None
                modified = None

            extension = entry.suffix.lower() if is_file and entry.suffix else None

            entries.append(FileEntry(
                name=entry.name,
                path=str(entry),
                is_dir=is_dir,
                is_file=is_file,
                size=size,
                modified=modified,
                extension=extension,
            ))

    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {path}")

    return BrowseResponse(
        current_path=str(path),
        parent_path=parent_path,
        entries=entries,
        total_files=total_files,
        total_dirs=total_dirs,
    )


@router.post("/read", response_model=FileContentResponse)
async def read_file(
    request: ReadFileRequest,
    _: str = Depends(verify_api_key),
) -> FileContentResponse:
    """Read the contents of a text file."""
    path = Path(os.path.expanduser(request.path))

    # Validate path access
    validate_path_access(path)

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    if not path.is_file():
        raise HTTPException(status_code=400, detail=f"Not a file: {path}")

    # Check file size
    try:
        stat = path.stat()
        size = stat.st_size
        modified = datetime.fromtimestamp(stat.st_mtime).isoformat()
    except (OSError, PermissionError):
        raise HTTPException(status_code=403, detail=f"Cannot access file: {path}")

    # Check if it's a text file we can read
    extension = path.suffix.lower()
    mime_type, _ = mimetypes.guess_type(str(path))

    is_text = (
        extension in TEXT_EXTENSIONS or
        (mime_type and mime_type.startswith('text/')) or
        path.name in ['Makefile', 'Dockerfile', 'Gemfile', 'Rakefile', 'Procfile']
    )

    if not is_text:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot read binary file. Supported: text files, code files"
        )

    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({size} bytes). Maximum: {MAX_FILE_SIZE} bytes"
        )

    # Read the file
    try:
        content = path.read_text(encoding='utf-8', errors='replace')
        is_truncated = False

        # Optionally limit lines
        if request.max_lines:
            lines = content.split('\n')
            if len(lines) > request.max_lines:
                content = '\n'.join(lines[:request.max_lines])
                is_truncated = True

    except (OSError, PermissionError) as e:
        raise HTTPException(status_code=403, detail=f"Cannot read file: {e}")

    return FileContentResponse(
        path=str(path),
        name=path.name,
        size=size,
        modified=modified,
        content=content,
        is_truncated=is_truncated,
        mime_type=mime_type,
    )


class QuickPathsResponse(BaseModel):
    """Common paths for quick access."""
    paths: list[FileEntry]


@router.get("/quick-paths", response_model=QuickPathsResponse)
async def get_quick_paths(
    _: str = Depends(verify_api_key),
) -> QuickPathsResponse:
    """Get common paths for quick navigation."""
    allowed_paths = get_allowed_paths()

    # If allowed paths are configured, use them as quick paths
    if allowed_paths:
        paths = []
        for p in allowed_paths:
            path = Path(p)
            if path.exists() and path.is_dir():
                paths.append(FileEntry(
                    name=path.name or str(path),
                    path=str(path),
                    is_dir=True,
                    is_file=False,
                ))
        return QuickPathsResponse(paths=paths)

    # Otherwise, show default common paths
    home = Path.home()

    candidates = [
        ("Home", home),
        ("Documents", home / "Documents"),
        ("GitHub", home / "Documents" / "GitHub"),
        ("Projects", home / "Projects"),
        ("Code", home / "Code"),
        ("Developer", home / "Developer"),
        ("Desktop", home / "Desktop"),
        ("Downloads", home / "Downloads"),
    ]

    paths = []
    for name, p in candidates:
        if p.exists() and p.is_dir():
            paths.append(FileEntry(
                name=name,
                path=str(p),
                is_dir=True,
                is_file=False,
            ))

    return QuickPathsResponse(paths=paths)


class CreateDirectoryRequest(BaseModel):
    """Request for creating a new directory."""
    parent_path: str
    name: str


class CreateDirectoryResponse(BaseModel):
    """Response for creating a directory."""
    path: str
    name: str
    created: bool


@router.post("/create-directory", response_model=CreateDirectoryResponse)
async def create_directory(
    request: CreateDirectoryRequest,
    _: str = Depends(verify_api_key),
) -> CreateDirectoryResponse:
    """Create a new directory."""
    parent = Path(os.path.expanduser(request.parent_path))

    # Validate path access
    validate_path_access(parent)

    if not parent.exists():
        raise HTTPException(status_code=404, detail=f"Parent path not found: {parent}")

    if not parent.is_dir():
        raise HTTPException(status_code=400, detail=f"Parent path is not a directory: {parent}")

    # Validate directory name
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Directory name cannot be empty")

    # Check for invalid characters
    invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
    for char in invalid_chars:
        if char in name:
            raise HTTPException(status_code=400, detail=f"Directory name contains invalid character: {char}")

    new_path = parent / name

    if new_path.exists():
        raise HTTPException(status_code=409, detail=f"Directory already exists: {new_path}")

    try:
        new_path.mkdir(parents=False, exist_ok=False)
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied to create directory in: {parent}")
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to create directory: {e}")

    return CreateDirectoryResponse(
        path=str(new_path),
        name=name,
        created=True,
    )


class SystemInfoResponse(BaseModel):
    """System information for remote access."""
    hostname: str
    platform: str
    home_dir: str
    tailscale_ip: Optional[str]
    orchestrator_url: str


@router.get("/system-info", response_model=SystemInfoResponse)
async def get_system_info(
    _: str = Depends(verify_api_key),
) -> SystemInfoResponse:
    """Get system information for remote access setup."""
    import platform
    import socket
    from ..core.config import get_settings

    settings = get_settings()

    # Try to get Tailscale IP
    tailscale_ip = settings.tailscale_ip
    if not tailscale_ip or tailscale_ip == "100.x.x.x":
        # Try to detect it
        try:
            import subprocess
            result = subprocess.run(['tailscale', 'ip', '-4'], capture_output=True, text=True)
            if result.returncode == 0:
                tailscale_ip = result.stdout.strip()
        except:
            tailscale_ip = None

    orchestrator_url = f"http://{tailscale_ip}:{settings.port}" if tailscale_ip else f"http://localhost:{settings.port}"

    return SystemInfoResponse(
        hostname=socket.gethostname(),
        platform=platform.system(),
        home_dir=str(Path.home()),
        tailscale_ip=tailscale_ip,
        orchestrator_url=orchestrator_url,
    )


# =============================================================================
# Allowed Paths Management
# =============================================================================

class AllowedPathsResponse(BaseModel):
    """Response containing allowed paths."""
    paths: list[str]
    restricted: bool  # True if paths are configured, False if all paths allowed


class SetAllowedPathsRequest(BaseModel):
    """Request to set allowed paths."""
    paths: list[str]


class AddAllowedPathRequest(BaseModel):
    """Request to add a single allowed path."""
    path: str


class RemoveAllowedPathRequest(BaseModel):
    """Request to remove an allowed path."""
    path: str


@router.get("/allowed-paths", response_model=AllowedPathsResponse)
async def get_allowed_paths_endpoint(
    _: str = Depends(verify_api_key),
) -> AllowedPathsResponse:
    """Get the list of allowed paths."""
    paths = get_allowed_paths()
    return AllowedPathsResponse(
        paths=paths,
        restricted=len(paths) > 0,
    )


@router.post("/allowed-paths", response_model=AllowedPathsResponse)
async def set_allowed_paths_endpoint(
    request: SetAllowedPathsRequest,
    _: str = Depends(verify_api_key),
) -> AllowedPathsResponse:
    """Set the list of allowed paths (replaces existing)."""
    paths = set_allowed_paths(request.paths)
    return AllowedPathsResponse(
        paths=paths,
        restricted=len(paths) > 0,
    )


@router.post("/allowed-paths/add", response_model=AllowedPathsResponse)
async def add_allowed_path_endpoint(
    request: AddAllowedPathRequest,
    _: str = Depends(verify_api_key),
) -> AllowedPathsResponse:
    """Add a path to the allowed list."""
    path = Path(os.path.expanduser(request.path))

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")

    if not path.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {path}")

    paths = add_allowed_path(request.path)
    return AllowedPathsResponse(
        paths=paths,
        restricted=len(paths) > 0,
    )


@router.post("/allowed-paths/remove", response_model=AllowedPathsResponse)
async def remove_allowed_path_endpoint(
    request: RemoveAllowedPathRequest,
    _: str = Depends(verify_api_key),
) -> AllowedPathsResponse:
    """Remove a path from the allowed list."""
    paths = remove_allowed_path(request.path)
    return AllowedPathsResponse(
        paths=paths,
        restricted=len(paths) > 0,
    )
