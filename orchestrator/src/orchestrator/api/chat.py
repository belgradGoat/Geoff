"""Chat session endpoints for interactive agent communication."""

import asyncio
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException, Depends, status
from pydantic import BaseModel

from ..core.agent_manager import get_agent_manager, AgentManager, AgentStatus
from ..core.config import get_settings
from ..core.security import verify_api_key
from ..core.command_processor import CommandProcessor

# Module-level command processor instance
command_processor = CommandProcessor()

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatSessionRequest(BaseModel):
    """Request body for starting a chat session."""
    working_directory: Optional[str] = None
    provider: str = "claude"


class ChatSessionResponse(BaseModel):
    """Response for chat session creation."""
    id: str
    status: str
    provider: str


@router.post("/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def start_chat_session(
    request: ChatSessionRequest,
    _: str = Depends(verify_api_key),
    manager: AgentManager = Depends(get_agent_manager),
) -> ChatSessionResponse:
    """Start an interactive chat session with an agent."""
    try:
        agent = await manager.launch_chat_agent(
            working_directory=request.working_directory,
            provider=request.provider,
        )

        return ChatSessionResponse(
            id=agent.id,
            status=agent.status.value,
            provider=agent.provider,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))


@router.delete("/sessions/{session_id}")
async def end_chat_session(
    session_id: str,
    _: str = Depends(verify_api_key),
    manager: AgentManager = Depends(get_agent_manager),
):
    """End a chat session."""
    try:
        await manager.stop_agent(session_id)
        return {"success": True}
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")


@router.get("/sessions/{session_id}/status")
async def get_chat_session_status(
    session_id: str,
    _: str = Depends(verify_api_key),
    manager: AgentManager = Depends(get_agent_manager),
):
    """
    Get status of a chat session to check if reconnection is possible.

    Returns:
        - 200: Session exists and is active (can reconnect)
        - 404: Session not found or cleaned up
        - 410: Session stopped by user
    """
    agent = manager.get_agent(session_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if agent.status == AgentStatus.STOPPED:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Session was stopped")

    return {
        "id": agent.id,
        "status": agent.status.value,
        "connected": agent.websocket_connected,
        "message_count": agent.message_count,
        "last_activity": agent.last_activity_at.isoformat(),
    }


@router.websocket("/sessions/{session_id}/ws")
async def chat_websocket(
    websocket: WebSocket,
    session_id: str,
    api_key: str = Query(..., alias="api_key"),
):
    """
    Bidirectional WebSocket for chat communication.

    Messages from client:
    - { "type": "input", "data": "user message" }

    Messages to client:
    - { "type": "output", "data": "agent response" }
    - { "type": "message_complete" }
    - { "type": "error", "message": "..." }
    - { "type": "heartbeat" }
    """
    settings = get_settings()

    # Verify API key
    if api_key != settings.api_key:
        await websocket.close(code=4003, reason="Invalid API key")
        return

    await websocket.accept()

    manager = get_agent_manager()
    agent = manager.get_agent(session_id)

    if not agent:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close(code=4004)
        return

    if not agent.is_chat_mode:
        await websocket.send_json({"type": "error", "message": "Agent is not in chat mode"})
        await websocket.close(code=4005)
        return

    # Mark WebSocket as connected and update activity
    from ..core.agent_manager import utcnow
    agent.websocket_connected = True
    agent.last_activity_at = utcnow()
    agent.disconnect_count += 1
    agent.marked_for_cleanup = False  # Un-mark if was marked

    # Check for excessive reconnections (potential abuse)
    if agent.disconnect_count > manager.settings.session_max_reconnections:
        await websocket.send_json({
            "type": "error",
            "message": "Session exceeded maximum reconnections"
        })
        await websocket.close(code=4006)
        return

    async def receive_and_respond():
        """Handle incoming messages and stream responses."""
        try:
            while True:
                try:
                    # Wait for input with timeout for heartbeat
                    data = await asyncio.wait_for(
                        websocket.receive_json(),
                        timeout=30.0
                    )
                except asyncio.TimeoutError:
                    # Send heartbeat
                    await websocket.send_json({"type": "heartbeat"})
                    # Update activity on heartbeat (keeps session alive)
                    agent.last_activity_at = utcnow()
                    continue

                if data.get("type") == "input":
                    user_input = data.get("data", "")

                    if not user_input.strip():
                        await websocket.send_json({
                            "type": "error",
                            "message": "Empty message"
                        })
                        continue

                    # Stream response back
                    try:
                        # Check if this is a slash command
                        if command_processor.is_command(user_input):
                            # Process command and stream response
                            async for line in command_processor.process(
                                user_input, session_id, agent.provider, manager
                            ):
                                await websocket.send_json({"type": "output", "data": line})
                        else:
                            # Regular message - send to agent
                            async for line in manager.send_chat_message(session_id, user_input):
                                await websocket.send_json({"type": "output", "data": line})

                        # Signal message complete
                        await websocket.send_json({"type": "message_complete"})

                    except Exception as e:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Agent error: {str(e)}"
                        })

        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"Error in receive_and_respond: {e}")

    try:
        await receive_and_respond()
    finally:
        # Mark WebSocket as disconnected (but DON'T remove agent)
        agent.websocket_connected = False
        agent.last_activity_at = utcnow()
        print(f"[DISCONNECT] Session {session_id} disconnected (total reconnects: {agent.disconnect_count})")
