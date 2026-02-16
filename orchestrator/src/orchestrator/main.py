"""FastAPI application entry point."""

import asyncio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.agents import router as agents_router
from .api.websocket import router as websocket_router
from .api.projects import router as projects_router
from .api.filesystem import router as filesystem_router
from .api.chat import router as chat_router
from .api.github import router as github_router
from .api.chains import router as chains_router
from .core.config import get_settings

app = FastAPI(
    title="Agent Orchestrator",
    description="API for launching and managing Claude agents remotely",
    version="0.1.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(agents_router)
app.include_router(websocket_router)
app.include_router(projects_router)
app.include_router(filesystem_router)
app.include_router(chat_router)
app.include_router(github_router)
app.include_router(chains_router)


@app.on_event("startup")
async def startup_event():
    """Initialize background tasks on application startup."""
    from .core.agent_manager import get_agent_manager
    manager = get_agent_manager()
    await manager.start_cleanup_task()
    print("[STARTUP] Background cleanup task started")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up on application shutdown."""
    from .core.agent_manager import get_agent_manager
    manager = get_agent_manager()
    if manager._cleanup_task:
        manager._cleanup_task.cancel()
        try:
            await manager._cleanup_task
        except asyncio.CancelledError:
            pass
    print("[SHUTDOWN] Cleanup task stopped")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Agent Orchestrator",
        "version": "0.1.0",
        "endpoints": {
            "agents": "/api/agents",
            "projects": "/api/projects",
            "github": "/api/github",
            "chat": "/api/chat",
            "chains": "/api/chains",
            "health": "/health",
        },
    }


def run():
    """Run the server."""
    settings = get_settings()
    uvicorn.run(
        "orchestrator.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    run()
