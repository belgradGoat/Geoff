"""WebSocket endpoints for streaming agent output."""

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from ..core.agent_manager import get_agent_manager, AgentStatus
from ..core.config import get_settings

router = APIRouter()


@router.websocket("/api/agents/{agent_id}/stream")
async def stream_agent_output(
    websocket: WebSocket,
    agent_id: str,
    api_key: str = Query(..., alias="api_key"),
):
    """
    WebSocket endpoint for streaming agent output.

    Connect with: ws://host:port/api/agents/{agent_id}/stream?api_key=YOUR_KEY
    """
    settings = get_settings()

    # Verify API key
    if api_key != settings.api_key:
        await websocket.close(code=4003, reason="Invalid API key")
        return

    await websocket.accept()

    manager = get_agent_manager()
    agent = manager.get_agent(agent_id)

    if not agent:
        await websocket.send_json({"type": "error", "message": "Agent not found"})
        await websocket.close(code=4004, reason="Agent not found")
        return

    # Send existing output first
    for line in agent.output_buffer:
        await websocket.send_json({"type": "output", "data": line})

    # If agent is already done, close connection
    if agent.status in (AgentStatus.STOPPED, AgentStatus.FAILED):
        await websocket.send_json({
            "type": "done",
            "status": agent.status.value,
            "exit_code": agent.exit_code,
        })
        await websocket.close()
        return

    # Subscribe to new output
    queue = manager.subscribe_output(agent_id)

    try:
        while True:
            try:
                # Wait for new output with timeout
                line = await asyncio.wait_for(queue.get(), timeout=30.0)

                if line is None:
                    # Stream ended
                    agent = manager.get_agent(agent_id)
                    await websocket.send_json({
                        "type": "done",
                        "status": agent.status.value if agent else "unknown",
                        "exit_code": agent.exit_code if agent else None,
                    })
                    break

                await websocket.send_json({"type": "output", "data": line})

            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({"type": "heartbeat"})

    except WebSocketDisconnect:
        pass
    finally:
        manager.unsubscribe_output(agent_id, queue)
