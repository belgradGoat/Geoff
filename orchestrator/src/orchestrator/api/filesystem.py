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

router = APIRouter(prefix="/api/filesystem", tags=["filesystem"])

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
    if not request.path:
        path = Path.home()
    else:
        path = Path(os.path.expanduser(request.path))

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")

    if not path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")

    parent_path = str(path.parent) if path.parent != path else None

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
