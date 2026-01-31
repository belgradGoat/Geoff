"""FastAPI application entry point."""

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.agents import router as agents_router
from .api.websocket import router as websocket_router
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
