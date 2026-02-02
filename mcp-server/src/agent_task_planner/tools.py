"""MCP tool implementations for task management."""

from typing import Optional
from uuid import UUID

from .db import get_db


# =============================================================================
# Project Functions
# =============================================================================


def list_projects(active_only: bool = True) -> dict:
    """
    List all projects.

    Args:
        active_only: If True, only return active projects

    Returns:
        List of projects
    """
    db = get_db()
    query = db.table("projects").select("*")

    if active_only:
        query = query.eq("is_active", True)

    result = query.order("name").execute()
    return {"projects": result.data, "count": len(result.data)}


def get_project(project_id: str) -> dict:
    """
    Get a specific project by ID.

    Args:
        project_id: The UUID of the project

    Returns:
        Project details
    """
    db = get_db()
    result = db.table("projects").select("*").eq("id", project_id).single().execute()
    return {"project": result.data}


def create_project(
    name: str,
    path: str,
    description: Optional[str] = None,
) -> dict:
    """
    Create a new project.

    Args:
        name: Project name (e.g., "MyApp")
        path: Full path to project directory (e.g., "/Users/.../GitHub/MyApp")
        description: Optional project description

    Returns:
        Created project
    """
    db = get_db()

    project_data = {
        "name": name,
        "path": path,
        "description": description,
        "is_active": True,
    }

    result = db.table("projects").insert(project_data).execute()
    return {"success": True, "project": result.data[0]}


def update_project(
    project_id: str,
    name: Optional[str] = None,
    path: Optional[str] = None,
    description: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> dict:
    """
    Update a project.

    Args:
        project_id: The UUID of the project
        name: New project name
        path: New project path
        description: New description
        is_active: Set active status

    Returns:
        Updated project
    """
    db = get_db()

    update_data = {}
    if name is not None:
        update_data["name"] = name
    if path is not None:
        update_data["path"] = path
    if description is not None:
        update_data["description"] = description
    if is_active is not None:
        update_data["is_active"] = is_active

    if not update_data:
        return {"success": False, "error": "No fields to update"}

    result = db.table("projects").update(update_data).eq("id", project_id).execute()

    if not result.data:
        return {"success": False, "error": "Project not found"}

    return {"success": True, "project": result.data[0]}


def scan_projects_folder(base_path: str) -> dict:
    """
    Scan a folder for projects (directories containing .git or common project files).

    Args:
        base_path: The base folder to scan (e.g., "/Users/.../GitHub")

    Returns:
        List of discovered project paths
    """
    import os

    discovered = []
    project_indicators = [".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml"]

    try:
        for item in os.listdir(base_path):
            item_path = os.path.join(base_path, item)
            if os.path.isdir(item_path) and not item.startswith("."):
                # Check for project indicators
                for indicator in project_indicators:
                    if os.path.exists(os.path.join(item_path, indicator)):
                        discovered.append({
                            "name": item,
                            "path": item_path,
                        })
                        break

        return {"success": True, "projects": discovered, "count": len(discovered)}
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# Task Functions
# =============================================================================


def list_tasks(
    status: Optional[str] = None,
    assigned_agent: Optional[str] = None,
    parent_id: Optional[str] = None,
    project_id: Optional[str] = None,
    limit: int = 50,
) -> dict:
    """
    List tasks with optional filters.

    Args:
        status: Filter by status (queued, ready, assigned, in_progress, done, failed, blocked)
        assigned_agent: Filter by assigned agent ID
        parent_id: Filter by parent task ID (for subtasks)
        project_id: Filter by project ID
        limit: Maximum number of tasks to return (default 50)

    Returns:
        List of tasks matching the filters
    """
    db = get_db()
    query = db.table("tasks").select("*, projects(id, name, path)")

    if status:
        query = query.eq("status", status)
    if assigned_agent:
        query = query.eq("assigned_agent", assigned_agent)
    if parent_id:
        query = query.eq("parent_id", parent_id)
    if project_id:
        query = query.eq("project_id", project_id)

    query = query.order("priority", desc=True).order("created_at", desc=True).limit(limit)

    result = query.execute()
    return {"tasks": result.data, "count": len(result.data)}


def _format_attachments_for_agent(attachments: list) -> list:
    """Format attachments for agent consumption - decode text, summarize binary."""
    import base64

    if not attachments:
        return []

    formatted = []
    for att in attachments:
        item = {
            "name": att.get("name", "unknown"),
            "type": att.get("type", "application/octet-stream"),
            "size": att.get("size", 0),
        }

        # Decode text content for easy reading
        if att.get("type", "").startswith("text/") or att.get("type") == "application/json":
            try:
                item["content"] = base64.b64decode(att.get("data", "")).decode("utf-8")
            except:
                item["content"] = "[Could not decode text content]"
        elif att.get("type", "").startswith("image/"):
            # Keep base64 for images - Claude can process these
            item["image_base64"] = att.get("data", "")
            item["note"] = "Image attached - base64 encoded"
        else:
            item["note"] = f"Binary file attached ({att.get('type')})"

        formatted.append(item)

    return formatted


def get_task(task_id: str) -> dict:
    """
    Get a specific task by ID.

    Args:
        task_id: The UUID of the task

    Returns:
        Task details including logs, subtasks, project info, and formatted attachments
    """
    db = get_db()

    # Get the task with project info
    task_result = db.table("tasks").select("*, projects(id, name, path)").eq("id", task_id).single().execute()

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

    # Format attachments for agent
    task_data = task_result.data
    if task_data and task_data.get("attachments"):
        task_data["attachments_formatted"] = _format_attachments_for_agent(task_data["attachments"])

    return {
        "task": task_data,
        "logs": logs_result.data,
        "subtasks": subtasks_result.data,
    }


def get_ready_tasks(project_id: Optional[str] = None, limit: int = 10) -> dict:
    """
    Get tasks that are ready to be claimed (status='ready').

    Args:
        project_id: Filter by project ID (optional)
        limit: Maximum number of tasks to return

    Returns:
        List of ready tasks ordered by priority, with project info
    """
    db = get_db()

    query = (
        db.table("tasks")
        .select("*, projects(id, name, path)")
        .eq("status", "ready")
    )

    if project_id:
        query = query.eq("project_id", project_id)

    result = (
        query
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
    project_id: Optional[str] = None,
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
        project_id: Project ID to associate the task with

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
        "project_id": project_id,
    }

    result = db.table("tasks").insert(task_data).execute()

    return {"success": True, "task": result.data[0]}
