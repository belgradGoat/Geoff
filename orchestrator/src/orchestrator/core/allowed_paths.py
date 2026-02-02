"""Allowed paths management for filesystem security."""

import json
import os
from pathlib import Path
from typing import Optional


# Config file location
CONFIG_DIR = Path.home() / ".geoff"
ALLOWED_PATHS_FILE = CONFIG_DIR / "allowed_paths.json"


def _ensure_config_dir():
    """Ensure the config directory exists."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def get_allowed_paths() -> list[str]:
    """
    Get the list of allowed paths.

    Returns empty list if no paths configured (allows all - backwards compatible).
    """
    if not ALLOWED_PATHS_FILE.exists():
        return []

    try:
        with open(ALLOWED_PATHS_FILE, 'r') as f:
            data = json.load(f)
            return data.get("allowed_paths", [])
    except (json.JSONDecodeError, IOError):
        return []


def set_allowed_paths(paths: list[str]) -> list[str]:
    """
    Set the list of allowed paths.

    Validates that each path exists and is a directory.
    Returns the list of valid paths that were saved.
    """
    _ensure_config_dir()

    # Validate and normalize paths
    valid_paths = []
    for p in paths:
        path = Path(os.path.expanduser(p)).resolve()
        if path.exists() and path.is_dir():
            valid_paths.append(str(path))

    # Remove duplicates while preserving order
    seen = set()
    unique_paths = []
    for p in valid_paths:
        if p not in seen:
            seen.add(p)
            unique_paths.append(p)

    # Save to file
    with open(ALLOWED_PATHS_FILE, 'w') as f:
        json.dump({"allowed_paths": unique_paths}, f, indent=2)

    return unique_paths


def add_allowed_path(path: str) -> list[str]:
    """Add a single path to the allowed list."""
    current = get_allowed_paths()
    normalized = str(Path(os.path.expanduser(path)).resolve())

    if normalized not in current:
        current.append(normalized)
        return set_allowed_paths(current)

    return current


def remove_allowed_path(path: str) -> list[str]:
    """Remove a path from the allowed list."""
    current = get_allowed_paths()
    normalized = str(Path(os.path.expanduser(path)).resolve())

    if normalized in current:
        current.remove(normalized)
        return set_allowed_paths(current)

    return current


def is_path_allowed(path: str) -> bool:
    """
    Check if a path is within one of the allowed directories.

    If no allowed paths are configured, all paths are allowed (backwards compatible).
    """
    allowed = get_allowed_paths()

    # If no restrictions configured, allow all
    if not allowed:
        return True

    # Normalize the path to check
    try:
        check_path = Path(os.path.expanduser(path)).resolve()
    except (ValueError, OSError):
        return False

    # Check if the path is within any allowed directory
    for allowed_path in allowed:
        try:
            allowed_dir = Path(allowed_path).resolve()
            # Check if check_path is the allowed_dir or a subdirectory
            if check_path == allowed_dir:
                return True
            if allowed_dir in check_path.parents:
                return True
        except (ValueError, OSError):
            continue

    return False


def get_allowed_roots() -> list[dict]:
    """
    Get allowed paths as browsable root directories.

    Returns list of dicts with name and path.
    """
    allowed = get_allowed_paths()

    if not allowed:
        # If no restrictions, return home directory as default
        home = Path.home()
        return [{"name": "Home", "path": str(home)}]

    roots = []
    for p in allowed:
        path = Path(p)
        roots.append({
            "name": path.name or str(path),
            "path": str(path)
        })

    return roots
