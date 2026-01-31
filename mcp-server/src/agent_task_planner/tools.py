"""MCP tool implementations for task management."""

from typing import Optional
from uuid import UUID

from .db import get_db


def list_tasks(
    status: Optional[str] = None,
    assigned_agent: Optional[str] = None,
    parent_id: Optional[str] = None,
    limit: int = 50,
) -> dict:
    """
    List tasks with optional filters.

    Args:
        status: Filter by status (queued, ready, assigned, in_progress, done, failed, blocked)
        assigned_agent: Filter by assigned agent ID
        parent_id: Filter by parent task ID (for subtasks)
        limit: Maximum number of tasks to return (default 50)

    Returns:
        List of tasks matching the filters
    """
    db = get_db()
    query = db.table("tasks").select("*")

    if status:
        query = query.eq("status", status)
    if assigned_agent:
        query = query.eq("assigned_agent", assigned_agent)
    if parent_id:
        query = query.eq("parent_id", parent_id)

    query = query.order("priority", desc=True).order("created_at", desc=True).limit(limit)

    result = query.execute()
    return {"tasks": result.data, "count": len(result.data)}


def get_task(task_id: str) -> dict:
    """
    Get a specific task by ID.

    Args:
        task_id: The UUID of the task

    Returns:
        Task details including logs
    """
    db = get_db()

    # Get the task
    task_result = db.table("tasks").select("*").eq("id", task_id).single().execute()

    # Get task logs
    logs_result = (
        db.table("task_logs")
        .select("*")
        .eq("task_id", task_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )

    # Get subtasks
    subtasks_result = (
        db.table("tasks")
        .select("id, title, status, priority")
        .eq("parent_id", task_id)
        .order("priority", desc=True)
        .execute()
    )

    return {
        "task": task_result.data,
        "logs": logs_result.data,
        "subtasks": subtasks_result.data,
    }


def get_ready_tasks(limit: int = 10) -> dict:
    """
    Get tasks that are ready to be claimed (status='ready').

    Args:
        limit: Maximum number of tasks to return

    Returns:
        List of ready tasks ordered by priority
    """
    db = get_db()

    result = (
        db.table("tasks")
        .select("*")
        .eq("status", "ready")
        .order("priority", desc=True)
        .order("created_at")
        .limit(limit)
        .execute()
    )

    return {"tasks": result.data, "count": len(result.data)}


def claim_task(task_id: str, agent_id: str) -> dict:
    """
    Atomically claim a task for an agent.

    Args:
        task_id: The UUID of the task to claim
        agent_id: The ID of the agent claiming the task

    Returns:
        The claimed task or error if already claimed
    """
    db = get_db()

    # Use update with a filter to ensure atomic claim
    # Only claim if status is 'ready' and not already assigned
    result = (
        db.table("tasks")
        .update({"status": "assigned", "assigned_agent": agent_id})
        .eq("id", task_id)
        .eq("status", "ready")
        .is_("assigned_agent", "null")
        .execute()
    )

    if not result.data:
        # Check why it failed
        task = db.table("tasks").select("status, assigned_agent").eq("id", task_id).single().execute()
        if task.data:
            if task.data["status"] != "ready":
                return {"success": False, "error": f"Task is not ready (status: {task.data['status']})"}
            if task.data["assigned_agent"]:
                return {
                    "success": False,
                    "error": f"Task already claimed by {task.data['assigned_agent']}",
                }
        return {"success": False, "error": "Task not found"}

    return {"success": True, "task": result.data[0]}


def update_progress(task_id: str, agent_id: str, progress: int, note: Optional[str] = None) -> dict:
    """
    Update task progress.

    Args:
        task_id: The UUID of the task
        agent_id: The ID of the agent (must match assigned agent)
        progress: Progress percentage (0-100)
        note: Optional progress note

    Returns:
        Updated task or error
    """
    db = get_db()

    # Verify ownership and update
    update_data = {"progress": progress, "status": "in_progress"}

    result = (
        db.table("tasks")
        .update(update_data)
        .eq("id", task_id)
        .eq("assigned_agent", agent_id)
        .execute()
    )

    if not result.data:
        return {"success": False, "error": "Task not found or not assigned to this agent"}

    # Add progress note if provided
    if note:
        db.table("task_logs").insert(
            {
                "task_id": task_id,
                "event_type": "note",
                "message": note,
                "agent_id": agent_id,
                "metadata": {"progress": progress},
            }
        ).execute()

    return {"success": True, "task": result.data[0]}


def complete_task(task_id: str, agent_id: str, result: Optional[str] = None) -> dict:
    """
    Mark a task as completed.

    Args:
        task_id: The UUID of the task
        agent_id: The ID of the agent (must match assigned agent)
        result: Optional result/output description

    Returns:
        Completed task or error
    """
    db = get_db()

    update_data = {"status": "done", "progress": 100, "result": result}

    query_result = (
        db.table("tasks")
        .update(update_data)
        .eq("id", task_id)
        .eq("assigned_agent", agent_id)
        .execute()
    )

    if not query_result.data:
        return {"success": False, "error": "Task not found or not assigned to this agent"}

    # Log completion
    db.table("task_logs").insert(
        {
            "task_id": task_id,
            "event_type": "completed",
            "message": result or "Task completed",
            "agent_id": agent_id,
            "new_status": "done",
        }
    ).execute()

    return {"success": True, "task": query_result.data[0]}


def fail_task(task_id: str, agent_id: str, error_message: str, retry: bool = True) -> dict:
    """
    Mark a task as failed.

    Args:
        task_id: The UUID of the task
        agent_id: The ID of the agent (must match assigned agent)
        error_message: Description of what went wrong
        retry: Whether to queue for retry if retries remaining

    Returns:
        Updated task or error
    """
    db = get_db()

    # Get current task state
    task = db.table("tasks").select("*").eq("id", task_id).eq("assigned_agent", agent_id).single().execute()

    if not task.data:
        return {"success": False, "error": "Task not found or not assigned to this agent"}

    current_retries = task.data.get("retry_count", 0)
    max_retries = task.data.get("max_retries", 3)

    if retry and current_retries < max_retries:
        # Queue for retry
        update_data = {
            "status": "ready",
            "assigned_agent": None,
            "retry_count": current_retries + 1,
            "error_message": error_message,
            "progress": 0,
        }
        new_status = "ready"
    else:
        # Mark as failed permanently
        update_data = {"status": "failed", "error_message": error_message}
        new_status = "failed"

    result = db.table("tasks").update(update_data).eq("id", task_id).execute()

    # Log failure
    db.table("task_logs").insert(
        {
            "task_id": task_id,
            "event_type": "failed" if new_status == "failed" else "error",
            "message": error_message,
            "agent_id": agent_id,
            "new_status": new_status,
            "metadata": {"retry_count": update_data.get("retry_count", current_retries)},
        }
    ).execute()

    return {
        "success": True,
        "task": result.data[0],
        "will_retry": new_status == "ready",
        "retries_remaining": max_retries - update_data.get("retry_count", current_retries),
    }


def add_subtask(
    parent_id: str,
    title: str,
    description: Optional[str] = None,
    priority: int = 0,
    complexity: str = "unknown",
) -> dict:
    """
    Add a subtask to an existing task.

    Args:
        parent_id: The UUID of the parent task
        title: Title of the subtask
        description: Optional description
        priority: Priority level (higher = more important)
        complexity: Complexity estimate (trivial, small, medium, large, unknown)

    Returns:
        Created subtask
    """
    db = get_db()

    # Verify parent exists
    parent = db.table("tasks").select("id, status").eq("id", parent_id).single().execute()
    if not parent.data:
        return {"success": False, "error": "Parent task not found"}

    subtask_data = {
        "title": title,
        "description": description,
        "parent_id": parent_id,
        "priority": priority,
        "complexity": complexity,
        "status": "ready",  # Subtasks are ready by default
    }

    result = db.table("tasks").insert(subtask_data).execute()

    return {"success": True, "subtask": result.data[0]}


def add_note(task_id: str, agent_id: str, note: str) -> dict:
    """
    Add a note to a task's log.

    Args:
        task_id: The UUID of the task
        agent_id: The ID of the agent adding the note
        note: The note content

    Returns:
        Created log entry
    """
    db = get_db()

    result = (
        db.table("task_logs")
        .insert(
            {
                "task_id": task_id,
                "event_type": "note",
                "message": note,
                "agent_id": agent_id,
            }
        )
        .execute()
    )

    return {"success": True, "log": result.data[0]}


def create_task(
    title: str,
    description: Optional[str] = None,
    priority: int = 0,
    complexity: str = "unknown",
    depends_on: Optional[list[str]] = None,
    tags: Optional[list[str]] = None,
    context: Optional[dict] = None,
    estimated_minutes: Optional[int] = None,
) -> dict:
    """
    Create a new task.

    Args:
        title: Task title
        description: Task description
        priority: Priority level (higher = more important)
        complexity: Complexity estimate (trivial, small, medium, large, unknown)
        depends_on: List of task IDs this task depends on
        tags: List of tags
        context: Additional context as JSON
        estimated_minutes: Estimated time to complete

    Returns:
        Created task
    """
    db = get_db()

    # Determine initial status
    status = "ready"
    if depends_on:
        # Check if all dependencies are done
        for dep_id in depends_on:
            dep_task = db.table("tasks").select("status").eq("id", dep_id).single().execute()
            if not dep_task.data or dep_task.data["status"] != "done":
                status = "queued"
                break

    task_data = {
        "title": title,
        "description": description,
        "priority": priority,
        "complexity": complexity,
        "status": status,
        "depends_on": depends_on or [],
        "tags": tags or [],
        "context": context or {},
        "estimated_minutes": estimated_minutes,
    }

    result = db.table("tasks").insert(task_data).execute()

    return {"success": True, "task": result.data[0]}
