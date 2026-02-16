"""FastMCP server for Agent Task Planner."""

from typing import Optional

from fastmcp import FastMCP

from .tools import (
    add_note,
    add_subtask,
    claim_task,
    complete_task,
    create_task,
    fail_task,
    get_ready_tasks,
    get_task,
    list_tasks,
    update_progress,
    # Project tools
    list_projects,
    get_project,
    create_project,
    update_project,
    scan_projects_folder,
    # GitHub integration tools
    github_link_task_to_issue,
    github_link_task_to_pr,
    github_add_commit_to_task,
    github_set_task_branch,
    # Chain integration tools
    chain_stage_set_result,
    chain_get_context,
)

# Create the FastMCP server
mcp = FastMCP("Agent Task Planner")


# =============================================================================
# Project Tools
# =============================================================================


@mcp.tool()
def project_list(active_only: bool = True) -> dict:
    """
    List all projects.

    Args:
        active_only: If True, only return active projects
    """
    return list_projects(active_only=active_only)


@mcp.tool()
def project_get(project_id: str) -> dict:
    """
    Get a specific project by ID.

    Args:
        project_id: The UUID of the project
    """
    return get_project(project_id)


@mcp.tool()
def project_create(name: str, path: str, description: Optional[str] = None) -> dict:
    """
    Create a new project.

    Args:
        name: Project name (e.g., "MyApp")
        path: Full path to project directory (e.g., "/Users/.../GitHub/MyApp")
        description: Optional project description
    """
    return create_project(name=name, path=path, description=description)


@mcp.tool()
def project_update(
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
    """
    return update_project(
        project_id=project_id,
        name=name,
        path=path,
        description=description,
        is_active=is_active,
    )


@mcp.tool()
def project_scan(base_path: str) -> dict:
    """
    Scan a folder for projects (directories with .git, package.json, etc.).

    Args:
        base_path: The base folder to scan (e.g., "/Users/.../GitHub")
    """
    return scan_projects_folder(base_path)


# =============================================================================
# Task Tools
# =============================================================================


@mcp.tool()
def task_list(
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
    """
    return list_tasks(
        status=status,
        assigned_agent=assigned_agent,
        parent_id=parent_id,
        project_id=project_id,
        limit=limit,
    )


@mcp.tool()
def task_get(task_id: str) -> dict:
    """
    Get a specific task by ID with its logs, subtasks, and project info.

    Args:
        task_id: The UUID of the task
    """
    return get_task(task_id)


@mcp.tool()
def task_get_ready(project_id: Optional[str] = None, limit: int = 10) -> dict:
    """
    Get tasks that are ready to be claimed.

    Args:
        project_id: Filter by project ID (optional)
        limit: Maximum number of tasks to return
    """
    return get_ready_tasks(project_id=project_id, limit=limit)


@mcp.tool()
def task_claim(task_id: str, agent_id: str) -> dict:
    """
    Atomically claim a task for an agent. Only works on 'ready' tasks.

    Args:
        task_id: The UUID of the task to claim
        agent_id: The ID of the agent claiming the task
    """
    return claim_task(task_id, agent_id)


@mcp.tool()
def task_update_progress(
    task_id: str, agent_id: str, progress: int, note: Optional[str] = None
) -> dict:
    """
    Update task progress (0-100).

    Args:
        task_id: The UUID of the task
        agent_id: The ID of the agent (must match assigned agent)
        progress: Progress percentage (0-100)
        note: Optional progress note
    """
    return update_progress(task_id, agent_id, progress, note=note)


@mcp.tool()
def task_complete(task_id: str, agent_id: str, result: Optional[str] = None) -> dict:
    """
    Mark a task as completed.

    Args:
        task_id: The UUID of the task
        agent_id: The ID of the agent (must match assigned agent)
        result: Optional result/output description
    """
    return complete_task(task_id, agent_id, result=result)


@mcp.tool()
def task_fail(task_id: str, agent_id: str, error_message: str, retry: bool = True) -> dict:
    """
    Mark a task as failed. Will auto-retry if retries remaining.

    Args:
        task_id: The UUID of the task
        agent_id: The ID of the agent (must match assigned agent)
        error_message: Description of what went wrong
        retry: Whether to queue for retry if retries remaining
    """
    return fail_task(task_id, agent_id, error_message, retry=retry)


@mcp.tool()
def task_add_subtask(
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
    """
    return add_subtask(parent_id, title, description=description, priority=priority, complexity=complexity)


@mcp.tool()
def task_add_note(task_id: str, agent_id: str, note: str) -> dict:
    """
    Add a note to a task's log.

    Args:
        task_id: The UUID of the task
        agent_id: The ID of the agent adding the note
        note: The note content
    """
    return add_note(task_id, agent_id, note)


@mcp.tool()
def task_create(
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
    """
    return create_task(
        title=title,
        description=description,
        priority=priority,
        complexity=complexity,
        depends_on=depends_on,
        tags=tags,
        context=context,
        estimated_minutes=estimated_minutes,
        project_id=project_id,
    )


# =============================================================================
# GitHub Integration Tools
# =============================================================================


@mcp.tool()
def task_link_to_issue(task_id: str, issue_number: int, repo_url: str) -> dict:
    """
    Link a task to a GitHub issue.

    Updates the task's context.github field with the issue reference.
    This allows tracking which GitHub issue corresponds to a task.

    Args:
        task_id: The UUID of the task to link
        issue_number: The GitHub issue number (e.g., 42)
        repo_url: The repository URL (e.g., "https://github.com/owner/repo")
    """
    return github_link_task_to_issue(task_id, issue_number, repo_url)


@mcp.tool()
def task_link_to_pr(task_id: str, pr_number: int, repo_url: str) -> dict:
    """
    Link a task to a GitHub pull request.

    Updates the task's context.github field with the PR reference.
    This allows tracking which pull request implements a task.

    Args:
        task_id: The UUID of the task to link
        pr_number: The GitHub PR number (e.g., 55)
        repo_url: The repository URL (e.g., "https://github.com/owner/repo")
    """
    return github_link_task_to_pr(task_id, pr_number, repo_url)


@mcp.tool()
def task_add_commit(task_id: str, commit_sha: str, message: Optional[str] = None) -> dict:
    """
    Add a commit reference to a task.

    Updates the task's context.github.related_commits field.
    This allows tracking which commits are related to a task.

    Args:
        task_id: The UUID of the task
        commit_sha: The Git commit SHA (full or short)
        message: Optional commit message for reference
    """
    return github_add_commit_to_task(task_id, commit_sha, message)


@mcp.tool()
def task_set_branch(task_id: str, branch_name: str) -> dict:
    """
    Set the working branch for a task.

    Updates the task's context.github.branch field.
    This indicates which branch is being used to work on the task.

    Args:
        task_id: The UUID of the task
        branch_name: The Git branch name (e.g., "feature/task-123")
    """
    return github_set_task_branch(task_id, branch_name)


# =============================================================================
# Chain Integration Tools
# =============================================================================


@mcp.tool()
def chain_set_stage_result(execution_id: str, stage_name: str, result_data: dict) -> dict:
    """
    Set structured result data for a chain stage.

    Called by agents running within a chain to report structured results.
    This is more reliable than parsing stdout for structured data like QC results.

    Args:
        execution_id: The chain execution ID
        stage_name: The stage name (e.g., 'qc_review', 'deep_research')
        result_data: Structured result data as a dict
    """
    return chain_stage_set_result(execution_id, stage_name, result_data)


@mcp.tool()
def chain_context(execution_id: str) -> dict:
    """
    Get accumulated context from a chain execution.

    Allows agents within a chain to read results from prior stages.
    Useful when an agent needs context from earlier stages.

    Args:
        execution_id: The chain execution ID
    """
    return chain_get_context(execution_id)


def main():
    """Run the MCP server."""
    mcp.run()


if __name__ == "__main__":
    main()
