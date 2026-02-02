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
        # Clean up when connection closes
        pass
