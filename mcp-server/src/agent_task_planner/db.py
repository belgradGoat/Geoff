"""Supabase database client."""

import os
from functools import lru_cache

from dotenv import load_dotenv
from supabase import create_client, Client


def get_env_path() -> str:
    """Get the path to .env file, checking multiple locations."""
    # Check current directory
    if os.path.exists(".env"):
        return ".env"
    # Check parent directory (when running from mcp-server/)
    parent_env = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".env")
    if os.path.exists(parent_env):
        return parent_env
    # Check project root
    project_root = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
    if os.path.exists(project_root):
        return project_root
    return ".env"


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Get a cached Supabase client instance."""
    load_dotenv(get_env_path())

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    if not url or not key:
        raise ValueError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY environment variables. "
            "Please create a .env file with these values."
        )

    return create_client(url, key)


def get_db() -> Client:
    """Get the database client."""
    return get_supabase_client()
