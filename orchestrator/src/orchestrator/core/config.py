"""Configuration settings for the orchestrator."""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings
from dotenv import load_dotenv


def get_env_path() -> str:
    """Get the path to .env file."""
    if os.path.exists(".env"):
        return ".env"
    parent_env = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".env")
    if os.path.exists(parent_env):
        return parent_env
    return ".env"


load_dotenv(get_env_path())


class Settings(BaseSettings):
    """Application settings."""

    # API Configuration
    api_key: str = os.getenv("ORCHESTRATOR_API_KEY", "dev-api-key")
    host: str = os.getenv("ORCHESTRATOR_HOST", "0.0.0.0")
    port: int = int(os.getenv("ORCHESTRATOR_PORT", "8080"))

    # Tailscale Configuration
    tailscale_ip: str | None = os.getenv("TAILSCALE_IP")

    # Claude CLI Configuration
    claude_command: str = "claude"
    default_working_dir: str = os.path.expanduser("~")

    # Agent Configuration
    max_agents: int = 10
    agent_timeout: int = 3600  # 1 hour default timeout

    # Supabase Configuration (for project lookups)
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_key: str = os.getenv("SUPABASE_SERVICE_KEY", "")

    # MCP Server Configuration (for spawned agents)
    mcp_python_path: str = os.getenv("MCP_PYTHON_PATH", "")

    class Config:
        env_prefix = "ORCHESTRATOR_"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
