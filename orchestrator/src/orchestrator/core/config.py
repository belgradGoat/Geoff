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

    # Provider Configuration
    default_provider: str = os.getenv("ORCHESTRATOR_DEFAULT_PROVIDER", "claude")

    # Provider-specific CLI commands (override if not in PATH)
    claude_command: str = os.getenv("ORCHESTRATOR_CLAUDE_COMMAND", "claude")
    codex_command: str = os.getenv("ORCHESTRATOR_CODEX_COMMAND", "codex")
    gemini_command: str = os.getenv("ORCHESTRATOR_GEMINI_COMMAND", "gemini")
    opencode_command: str = os.getenv("ORCHESTRATOR_OPENCODE_COMMAND", "opencode")

    default_working_dir: str = os.path.expanduser("~")

    def get_provider_command(self, provider: str) -> str:
        """Get the command for a specific provider."""
        commands = {
            "claude": self.claude_command,
            "codex": self.codex_command,
            "gemini": self.gemini_command,
            "opencode": self.opencode_command,
        }
        return commands.get(provider, provider)

    # Agent Configuration
    max_agents: int = 10
    agent_timeout: int = 3600  # 1 hour default timeout

    # Session Management Configuration
    session_temp_disconnect_timeout: int = int(os.getenv("SESSION_TEMP_DISCONNECT_TIMEOUT", "900"))  # 15 minutes
    session_abandoned_timeout: int = int(os.getenv("SESSION_ABANDONED_TIMEOUT", "3600"))  # 1 hour
    session_cleanup_interval: int = int(os.getenv("SESSION_CLEANUP_INTERVAL", "300"))  # 5 minutes
    session_max_reconnections: int = int(os.getenv("SESSION_MAX_RECONNECTIONS", "50"))  # Generous for mobile

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
