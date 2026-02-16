"""GitHub API endpoints for Git status and GitHub integration."""

import os
import subprocess
import re
import json
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from supabase import create_client

from ..core.security import verify_api_key
from ..core.config import get_settings
from ..core.encryption import encrypt_token, decrypt_token, is_encrypted

router = APIRouter(prefix="/api/github", tags=["github"])


def get_supabase_client():
    """Get Supabase client."""
    settings = get_settings()
    if settings.supabase_url and settings.supabase_service_key:
        return create_client(settings.supabase_url, settings.supabase_service_key)
    return None


# ============================================================================
# Pydantic Models
# ============================================================================

class GitStatus(BaseModel):
    """Git repository status."""
    branch: str
    ahead: int = 0
    behind: int = 0
    modified: List[str] = []
    untracked: List[str] = []
    staged: List[str] = []
    is_git_repo: bool = True
    remote_url: Optional[str] = None
    has_remote: bool = False


class GitBranch(BaseModel):
    """Git branch information."""
    name: str
    is_current: bool
    last_commit: Optional[str] = None
    last_commit_date: Optional[str] = None


class BranchListResponse(BaseModel):
    """Response for listing branches."""
    branches: List[GitBranch]
    current_branch: str
    count: int


class GitCommit(BaseModel):
    """Git commit information."""
    sha: str
    short_sha: str
    message: str
    author: str
    date: str


class CommitListResponse(BaseModel):
    """Response for listing commits."""
    commits: List[GitCommit]
    count: int


class PullRequest(BaseModel):
    """GitHub pull request."""
    number: int
    title: str
    state: str
    author: str
    created_at: str
    url: str
    head_branch: str
    base_branch: str


class PullRequestListResponse(BaseModel):
    """Response for listing pull requests."""
    pull_requests: List[PullRequest]
    count: int


class CreatePullRequestRequest(BaseModel):
    """Request to create a pull request."""
    title: str
    body: Optional[str] = ""
    head_branch: Optional[str] = None  # Defaults to current branch
    base_branch: Optional[str] = "main"


class GitHubIssue(BaseModel):
    """GitHub issue."""
    number: int
    title: str
    state: str
    labels: List[str] = []
    assignees: List[str] = []
    created_at: str
    url: str


class IssueListResponse(BaseModel):
    """Response for listing issues."""
    issues: List[GitHubIssue]
    count: int


class CreateIssueRequest(BaseModel):
    """Request to create an issue."""
    title: str
    body: Optional[str] = ""
    labels: List[str] = []


class PRReview(BaseModel):
    """GitHub PR review."""
    id: int
    author: str
    state: str
    body: str
    submitted_at: str


class PRComment(BaseModel):
    """GitHub PR comment."""
    id: int
    author: str
    body: str
    created_at: str
    path: Optional[str] = None
    line: Optional[int] = None


class PullRequestDetail(BaseModel):
    """Detailed pull request information."""
    number: int
    title: str
    state: str
    author: str
    created_at: str
    url: str
    head_branch: str
    base_branch: str
    body: str = ""
    additions: int = 0
    deletions: int = 0
    changed_files: int = 0
    mergeable: bool = False
    review_status: str = "pending"
    labels: List[str] = []
    reviews: List[PRReview] = []
    comments: List[PRComment] = []


class PRChangedFile(BaseModel):
    """A file changed in a PR."""
    filename: str
    status: str
    additions: int = 0
    deletions: int = 0
    patch: str = ""


class PRFilesResponse(BaseModel):
    """Response for PR changed files."""
    files: List[PRChangedFile]
    count: int


class PRCommentRequest(BaseModel):
    """Request to add a comment to a PR."""
    body: str


class PRReviewRequest(BaseModel):
    """Request to submit a PR review."""
    event: str  # 'approve' | 'request_changes' | 'comment'
    body: Optional[str] = ""


class PRMergeRequest(BaseModel):
    """Request to merge a PR."""
    method: Optional[str] = "merge"  # 'merge' | 'squash' | 'rebase'


class TokenValidationRequest(BaseModel):
    """Request to validate a GitHub token."""
    token: str


class TokenValidationResponse(BaseModel):
    """Response for token validation."""
    valid: bool
    username: Optional[str] = None
    scopes: List[str] = []
    error: Optional[str] = None


class GitHubSettingsRequest(BaseModel):
    """Request to update GitHub settings for a project."""
    token: Optional[str] = None
    repo_url: Optional[str] = None
    default_branch: Optional[str] = None
    auto_create_pr: Optional[bool] = None
    sync_issues: Optional[bool] = None


class GitHubSettings(BaseModel):
    """GitHub settings response."""
    token_configured: bool = False
    repo_url: Optional[str] = None
    owner: Optional[str] = None
    repo: Optional[str] = None
    default_branch: str = "main"
    auto_create_pr: bool = False
    sync_issues: bool = False


# ============================================================================
# Helper Functions
# ============================================================================

def run_git_command(cwd: str, args: List[str], timeout: int = 30) -> tuple[str, str, int]:
    """Run a git command and return stdout, stderr, and return code."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except subprocess.TimeoutExpired:
        return "", "Command timed out", 1
    except FileNotFoundError:
        return "", "Git not found", 1
    except Exception as e:
        return "", str(e), 1


def run_gh_command(cwd: str, args: List[str], timeout: int = 30) -> tuple[str, str, int]:
    """Run a gh CLI command and return stdout, stderr, and return code."""
    try:
        result = subprocess.run(
            ["gh"] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except subprocess.TimeoutExpired:
        return "", "Command timed out", 1
    except FileNotFoundError:
        return "", "GitHub CLI (gh) not found. Install it from https://cli.github.com/", 1
    except Exception as e:
        return "", str(e), 1


def get_project_path(project_id: str) -> Optional[str]:
    """Get project path from database."""
    supabase = get_supabase_client()
    if not supabase:
        return None

    result = supabase.table("projects").select("path").eq("id", project_id).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]["path"]
    return None


def parse_remote_url(url: str) -> tuple[Optional[str], Optional[str]]:
    """Parse GitHub owner/repo from remote URL."""
    # Handle SSH URLs: git@github.com:owner/repo.git
    ssh_match = re.match(r"git@github\.com:(.+)/(.+?)(?:\.git)?$", url)
    if ssh_match:
        return ssh_match.group(1), ssh_match.group(2)

    # Handle HTTPS URLs: https://github.com/owner/repo.git
    https_match = re.match(r"https://github\.com/(.+)/(.+?)(?:\.git)?$", url)
    if https_match:
        return https_match.group(1), https_match.group(2)

    return None, None


# ============================================================================
# Git Status Endpoints
# ============================================================================

@router.get("/{project_id}/status", response_model=GitStatus)
async def get_git_status(
    project_id: str,
    _: str = Depends(verify_api_key),
) -> GitStatus:
    """Get git status for a project."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    if not os.path.isdir(project_path):
        raise HTTPException(status_code=400, detail=f"Project directory not found: {project_path}")

    # Check if it's a git repo
    git_dir = os.path.join(project_path, ".git")
    if not os.path.isdir(git_dir):
        return GitStatus(
            branch="",
            is_git_repo=False,
        )

    # Get current branch
    stdout, _, code = run_git_command(project_path, ["rev-parse", "--abbrev-ref", "HEAD"])
    branch = stdout if code == 0 else "unknown"

    # Get remote URL
    remote_url = None
    has_remote = False
    stdout, _, code = run_git_command(project_path, ["remote", "get-url", "origin"])
    if code == 0 and stdout:
        remote_url = stdout
        has_remote = True

    # Get ahead/behind counts
    ahead = 0
    behind = 0
    if has_remote:
        stdout, _, code = run_git_command(project_path, ["rev-list", "--left-right", "--count", f"HEAD...origin/{branch}"])
        if code == 0 and stdout:
            parts = stdout.split()
            if len(parts) == 2:
                ahead = int(parts[0])
                behind = int(parts[1])

    # Get modified, untracked, and staged files
    modified = []
    untracked = []
    staged = []

    stdout, _, code = run_git_command(project_path, ["status", "--porcelain"])
    if code == 0 and stdout:
        for line in stdout.split("\n"):
            if not line:
                continue
            status = line[:2]
            filename = line[3:]

            if status[0] in "MADRC":  # Staged
                staged.append(filename)
            if status[1] == "M":  # Modified (not staged)
                modified.append(filename)
            elif status[1] == "?" or status == "??":  # Untracked
                untracked.append(filename)

    return GitStatus(
        branch=branch,
        ahead=ahead,
        behind=behind,
        modified=modified,
        untracked=untracked,
        staged=staged,
        is_git_repo=True,
        remote_url=remote_url,
        has_remote=has_remote,
    )


# ============================================================================
# Branch Endpoints
# ============================================================================

@router.get("/{project_id}/branches", response_model=BranchListResponse)
async def list_branches(
    project_id: str,
    _: str = Depends(verify_api_key),
) -> BranchListResponse:
    """List git branches for a project."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if directory is a git repo
    git_dir = os.path.join(project_path, ".git")
    if not os.path.isdir(git_dir):
        return BranchListResponse(branches=[], current_branch="", count=0)

    # Get current branch
    stdout, _, code = run_git_command(project_path, ["rev-parse", "--abbrev-ref", "HEAD"])
    current_branch = stdout if code == 0 else ""

    # Get all branches with last commit info
    stdout, stderr, code = run_git_command(
        project_path,
        ["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)|%(objectname:short)|%(committerdate:iso)", "refs/heads/"]
    )

    if code != 0:
        raise HTTPException(status_code=500, detail=f"Failed to list branches: {stderr}")

    branches = []
    for line in stdout.split("\n"):
        if not line:
            continue
        parts = line.split("|")
        if len(parts) >= 3:
            name = parts[0]
            branches.append(GitBranch(
                name=name,
                is_current=name == current_branch,
                last_commit=parts[1],
                last_commit_date=parts[2],
            ))

    return BranchListResponse(
        branches=branches,
        current_branch=current_branch,
        count=len(branches),
    )


@router.post("/{project_id}/branches")
async def create_branch(
    project_id: str,
    branch_name: str = Query(..., description="Name of the new branch"),
    from_branch: Optional[str] = Query(None, description="Base branch (defaults to current)"),
    _: str = Depends(verify_api_key),
):
    """Create a new git branch."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    args = ["checkout", "-b", branch_name]
    if from_branch:
        args.append(from_branch)

    stdout, stderr, code = run_git_command(project_path, args)

    if code != 0:
        raise HTTPException(status_code=400, detail=f"Failed to create branch: {stderr}")

    return {"success": True, "branch": branch_name, "message": f"Created and switched to branch '{branch_name}'"}


@router.post("/{project_id}/branches/checkout")
async def checkout_branch(
    project_id: str,
    branch_name: str = Query(..., description="Branch to checkout"),
    _: str = Depends(verify_api_key),
):
    """Checkout an existing branch."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    stdout, stderr, code = run_git_command(project_path, ["checkout", branch_name])

    if code != 0:
        raise HTTPException(status_code=400, detail=f"Failed to checkout branch: {stderr}")

    return {"success": True, "branch": branch_name, "message": f"Switched to branch '{branch_name}'"}


# ============================================================================
# Commit Endpoints
# ============================================================================

@router.get("/{project_id}/commits", response_model=CommitListResponse)
async def list_commits(
    project_id: str,
    limit: int = Query(20, ge=1, le=100, description="Number of commits to return"),
    branch: Optional[str] = Query(None, description="Branch to list commits from"),
    _: str = Depends(verify_api_key),
) -> CommitListResponse:
    """List recent commits for a project."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if directory is a git repo
    git_dir = os.path.join(project_path, ".git")
    if not os.path.isdir(git_dir):
        return CommitListResponse(commits=[], count=0)

    args = ["log", f"-{limit}", "--format=%H|%h|%s|%an|%ci"]
    if branch:
        args.append(branch)

    stdout, stderr, code = run_git_command(project_path, args)

    if code != 0:
        raise HTTPException(status_code=500, detail=f"Failed to list commits: {stderr}")

    commits = []
    for line in stdout.split("\n"):
        if not line:
            continue
        parts = line.split("|", 4)
        if len(parts) >= 5:
            commits.append(GitCommit(
                sha=parts[0],
                short_sha=parts[1],
                message=parts[2],
                author=parts[3],
                date=parts[4],
            ))

    return CommitListResponse(commits=commits, count=len(commits))


# ============================================================================
# Pull Request Endpoints (using gh CLI)
# ============================================================================

@router.get("/{project_id}/pulls", response_model=PullRequestListResponse)
async def list_pull_requests(
    project_id: str,
    state: str = Query("open", description="PR state: open, closed, merged, all"),
    limit: int = Query(20, ge=1, le=100, description="Number of PRs to return"),
    _: str = Depends(verify_api_key),
) -> PullRequestListResponse:
    """List pull requests for a project using gh CLI."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    args = ["pr", "list", "--json", "number,title,state,author,createdAt,url,headRefName,baseRefName", "--limit", str(limit)]
    if state != "all":
        args.extend(["--state", state])

    # Check if directory is a git repo
    git_dir = os.path.join(project_path, ".git")
    if not os.path.isdir(git_dir):
        return PullRequestListResponse(pull_requests=[], count=0)

    stdout, stderr, code = run_gh_command(project_path, args)

    if code != 0:
        if "gh auth login" in stderr.lower() or "not logged in" in stderr.lower():
            raise HTTPException(status_code=401, detail="GitHub CLI not authenticated. Run 'gh auth login' first.")
        raise HTTPException(status_code=500, detail=f"Failed to list PRs: {stderr}")

    import json
    try:
        data = json.loads(stdout) if stdout else []
    except json.JSONDecodeError:
        data = []

    pull_requests = []
    for pr in data:
        author_login = pr.get("author", {}).get("login", "unknown") if isinstance(pr.get("author"), dict) else "unknown"
        pull_requests.append(PullRequest(
            number=pr.get("number", 0),
            title=pr.get("title", ""),
            state=pr.get("state", "").lower(),
            author=author_login,
            created_at=pr.get("createdAt", ""),
            url=pr.get("url", ""),
            head_branch=pr.get("headRefName", ""),
            base_branch=pr.get("baseRefName", ""),
        ))

    return PullRequestListResponse(pull_requests=pull_requests, count=len(pull_requests))


@router.post("/{project_id}/pulls", response_model=PullRequest)
async def create_pull_request(
    project_id: str,
    request: CreatePullRequestRequest,
    _: str = Depends(verify_api_key),
) -> PullRequest:
    """Create a pull request using gh CLI."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    args = ["pr", "create", "--title", request.title, "--body", request.body or ""]

    if request.head_branch:
        args.extend(["--head", request.head_branch])
    if request.base_branch:
        args.extend(["--base", request.base_branch])

    stdout, stderr, code = run_gh_command(project_path, args)

    if code != 0:
        raise HTTPException(status_code=400, detail=f"Failed to create PR: {stderr}")

    # Extract PR URL from output
    pr_url = stdout.strip()

    # Get PR details
    args = ["pr", "view", "--json", "number,title,state,author,createdAt,url,headRefName,baseRefName"]
    stdout, stderr, code = run_gh_command(project_path, args)

    if code != 0:
        # Return basic info if we can't get details
        return PullRequest(
            number=0,
            title=request.title,
            state="open",
            author="",
            created_at=datetime.utcnow().isoformat(),
            url=pr_url,
            head_branch=request.head_branch or "",
            base_branch=request.base_branch or "main",
        )

    import json
    try:
        pr = json.loads(stdout)
        author_login = pr.get("author", {}).get("login", "") if isinstance(pr.get("author"), dict) else ""
        return PullRequest(
            number=pr.get("number", 0),
            title=pr.get("title", request.title),
            state=pr.get("state", "open").lower(),
            author=author_login,
            created_at=pr.get("createdAt", ""),
            url=pr.get("url", pr_url),
            head_branch=pr.get("headRefName", request.head_branch or ""),
            base_branch=pr.get("baseRefName", request.base_branch or "main"),
        )
    except json.JSONDecodeError:
        return PullRequest(
            number=0,
            title=request.title,
            state="open",
            author="",
            created_at=datetime.utcnow().isoformat(),
            url=pr_url,
            head_branch=request.head_branch or "",
            base_branch=request.base_branch or "main",
        )


# ============================================================================
# Issue Endpoints (using gh CLI)
# ============================================================================

@router.get("/{project_id}/issues", response_model=IssueListResponse)
async def list_issues(
    project_id: str,
    state: str = Query("open", description="Issue state: open, closed, all"),
    limit: int = Query(20, ge=1, le=100, description="Number of issues to return"),
    _: str = Depends(verify_api_key),
) -> IssueListResponse:
    """List issues for a project using gh CLI."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if directory is a git repo
    git_dir = os.path.join(project_path, ".git")
    if not os.path.isdir(git_dir):
        return IssueListResponse(issues=[], count=0)

    args = ["issue", "list", "--json", "number,title,state,labels,assignees,createdAt,url", "--limit", str(limit)]
    if state != "all":
        args.extend(["--state", state])

    stdout, stderr, code = run_gh_command(project_path, args)

    if code != 0:
        if "gh auth login" in stderr.lower() or "not logged in" in stderr.lower():
            raise HTTPException(status_code=401, detail="GitHub CLI not authenticated. Run 'gh auth login' first.")
        raise HTTPException(status_code=500, detail=f"Failed to list issues: {stderr}")

    import json
    try:
        data = json.loads(stdout) if stdout else []
    except json.JSONDecodeError:
        data = []

    issues = []
    for issue in data:
        labels = [l.get("name", "") for l in issue.get("labels", []) if isinstance(l, dict)]
        assignees = [a.get("login", "") for a in issue.get("assignees", []) if isinstance(a, dict)]
        issues.append(GitHubIssue(
            number=issue.get("number", 0),
            title=issue.get("title", ""),
            state=issue.get("state", "").lower(),
            labels=labels,
            assignees=assignees,
            created_at=issue.get("createdAt", ""),
            url=issue.get("url", ""),
        ))

    return IssueListResponse(issues=issues, count=len(issues))


@router.post("/{project_id}/issues", response_model=GitHubIssue)
async def create_issue(
    project_id: str,
    request: CreateIssueRequest,
    _: str = Depends(verify_api_key),
) -> GitHubIssue:
    """Create an issue using gh CLI."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    args = ["issue", "create", "--title", request.title, "--body", request.body or ""]

    for label in request.labels:
        args.extend(["--label", label])

    stdout, stderr, code = run_gh_command(project_path, args)

    if code != 0:
        raise HTTPException(status_code=400, detail=f"Failed to create issue: {stderr}")

    # Extract issue URL from output
    issue_url = stdout.strip()

    # Get issue number from URL
    issue_number = 0
    if "/issues/" in issue_url:
        try:
            issue_number = int(issue_url.split("/issues/")[-1])
        except ValueError:
            pass

    return GitHubIssue(
        number=issue_number,
        title=request.title,
        state="open",
        labels=request.labels,
        assignees=[],
        created_at=datetime.utcnow().isoformat(),
        url=issue_url,
    )


# ============================================================================
# Token Validation Endpoint
# ============================================================================

@router.post("/validate-token", response_model=TokenValidationResponse)
async def validate_github_token(
    request: TokenValidationRequest,
    _: str = Depends(verify_api_key),
) -> TokenValidationResponse:
    """Validate a GitHub personal access token."""
    import requests

    try:
        response = requests.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"token {request.token}",
                "Accept": "application/vnd.github.v3+json",
            },
            timeout=10,
        )

        if response.status_code == 200:
            user_data = response.json()
            # Get scopes from response headers
            scopes = response.headers.get("X-OAuth-Scopes", "").split(", ")
            scopes = [s.strip() for s in scopes if s.strip()]

            return TokenValidationResponse(
                valid=True,
                username=user_data.get("login"),
                scopes=scopes,
            )
        elif response.status_code == 401:
            return TokenValidationResponse(
                valid=False,
                error="Invalid or expired token",
            )
        else:
            return TokenValidationResponse(
                valid=False,
                error=f"GitHub API error: {response.status_code}",
            )
    except requests.RequestException as e:
        return TokenValidationResponse(
            valid=False,
            error=f"Network error: {str(e)}",
        )


# ============================================================================
# GitHub Settings Endpoints
# ============================================================================

@router.get("/{project_id}/settings", response_model=GitHubSettings)
async def get_github_settings(
    project_id: str,
    _: str = Depends(verify_api_key),
) -> GitHubSettings:
    """Get GitHub settings for a project."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

    result = supabase.table("projects").select("settings").eq("id", project_id).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="Project not found")

    settings = result.data[0].get("settings") or {}
    github_settings = settings.get("github", {})

    return GitHubSettings(
        token_configured=bool(github_settings.get("token")),
        repo_url=github_settings.get("repo_url"),
        owner=github_settings.get("owner"),
        repo=github_settings.get("repo"),
        default_branch=github_settings.get("default_branch", "main"),
        auto_create_pr=github_settings.get("auto_create_pr", False),
        sync_issues=github_settings.get("sync_issues", False),
    )


@router.post("/{project_id}/push")
async def push_changes(
    project_id: str,
    _: str = Depends(verify_api_key),
):
    """Push commits to remote."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    stdout, stderr, code = run_git_command(project_path, ["push"])

    if code != 0:
        raise HTTPException(status_code=400, detail=f"Push failed: {stderr}")

    return {"success": True, "message": stdout or "Pushed successfully"}


@router.post("/{project_id}/pull")
async def pull_changes(
    project_id: str,
    _: str = Depends(verify_api_key),
):
    """Pull changes from remote."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    stdout, stderr, code = run_git_command(project_path, ["pull"])

    if code != 0:
        raise HTTPException(status_code=400, detail=f"Pull failed: {stderr}")

    return {"success": True, "message": stdout or "Pulled successfully"}


@router.put("/{project_id}/settings", response_model=GitHubSettings)
async def update_github_settings(
    project_id: str,
    request: GitHubSettingsRequest,
    _: str = Depends(verify_api_key),
) -> GitHubSettings:
    """Update GitHub settings for a project."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Get current settings
    result = supabase.table("projects").select("settings").eq("id", project_id).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="Project not found")

    current_settings = result.data[0].get("settings") or {}
    github_settings = current_settings.get("github", {})

    # Update fields if provided
    if request.token is not None:
        # Encrypt the token before storing
        github_settings["token"] = encrypt_token(request.token)

    if request.repo_url is not None:
        github_settings["repo_url"] = request.repo_url
        # Parse owner/repo from URL
        owner, repo = parse_remote_url(request.repo_url)
        github_settings["owner"] = owner
        github_settings["repo"] = repo

    if request.default_branch is not None:
        github_settings["default_branch"] = request.default_branch

    if request.auto_create_pr is not None:
        github_settings["auto_create_pr"] = request.auto_create_pr

    if request.sync_issues is not None:
        github_settings["sync_issues"] = request.sync_issues

    # Save updated settings
    current_settings["github"] = github_settings
    supabase.table("projects").update({"settings": current_settings}).eq("id", project_id).execute()

    return GitHubSettings(
        token_configured=bool(github_settings.get("token")),
        repo_url=github_settings.get("repo_url"),
        owner=github_settings.get("owner"),
        repo=github_settings.get("repo"),
        default_branch=github_settings.get("default_branch", "main"),
        auto_create_pr=github_settings.get("auto_create_pr", False),
        sync_issues=github_settings.get("sync_issues", False),
    )


# ============================================================================
# PR Detail Endpoints (Phase 1)
# ============================================================================

@router.get("/{project_id}/pulls/{pr_number}", response_model=PullRequestDetail)
async def get_pull_request_detail(
    project_id: str,
    pr_number: int,
    _: str = Depends(verify_api_key),
) -> PullRequestDetail:
    """Get detailed information about a specific pull request."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    fields = "number,title,state,author,createdAt,url,headRefName,baseRefName,body,additions,deletions,changedFiles,mergeable,labels,reviews,comments,reviewDecision"
    stdout, stderr, code = run_gh_command(
        project_path,
        ["pr", "view", str(pr_number), "--json", fields]
    )

    if code != 0:
        raise HTTPException(status_code=500, detail=f"Failed to get PR details: {stderr}")

    try:
        pr = json.loads(stdout)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse PR data")

    author_login = pr.get("author", {}).get("login", "unknown") if isinstance(pr.get("author"), dict) else "unknown"
    labels = [l.get("name", "") for l in pr.get("labels", []) if isinstance(l, dict)]

    reviews = []
    for r in pr.get("reviews", []):
        reviews.append(PRReview(
            id=r.get("id", 0) if isinstance(r.get("id"), int) else 0,
            author=r.get("author", {}).get("login", "unknown") if isinstance(r.get("author"), dict) else "unknown",
            state=r.get("state", "").lower(),
            body=r.get("body", ""),
            submitted_at=r.get("submittedAt", ""),
        ))

    comments = []
    for c in pr.get("comments", []):
        comments.append(PRComment(
            id=c.get("id", 0) if isinstance(c.get("id"), int) else 0,
            author=c.get("author", {}).get("login", "unknown") if isinstance(c.get("author"), dict) else "unknown",
            body=c.get("body", ""),
            created_at=c.get("createdAt", ""),
        ))

    review_decision = pr.get("reviewDecision", "").lower()
    if review_decision == "approved":
        review_status = "approved"
    elif review_decision == "changes_requested":
        review_status = "changes_requested"
    else:
        review_status = "pending"

    return PullRequestDetail(
        number=pr.get("number", pr_number),
        title=pr.get("title", ""),
        state=pr.get("state", "").lower(),
        author=author_login,
        created_at=pr.get("createdAt", ""),
        url=pr.get("url", ""),
        head_branch=pr.get("headRefName", ""),
        base_branch=pr.get("baseRefName", ""),
        body=pr.get("body", ""),
        additions=pr.get("additions", 0),
        deletions=pr.get("deletions", 0),
        changed_files=pr.get("changedFiles", 0),
        mergeable=pr.get("mergeable", "") == "MERGEABLE",
        review_status=review_status,
        labels=labels,
        reviews=reviews,
        comments=comments,
    )


@router.get("/{project_id}/pulls/{pr_number}/files", response_model=PRFilesResponse)
async def get_pull_request_files(
    project_id: str,
    pr_number: int,
    _: str = Depends(verify_api_key),
) -> PRFilesResponse:
    """Get changed files and diffs for a pull request."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    stdout, stderr, code = run_gh_command(
        project_path,
        ["pr", "diff", str(pr_number), "--name-only"]
    )

    if code != 0:
        raise HTTPException(status_code=500, detail=f"Failed to get PR files: {stderr}")

    filenames = [f for f in stdout.split("\n") if f.strip()]

    diff_stdout, diff_stderr, diff_code = run_gh_command(
        project_path,
        ["pr", "diff", str(pr_number)],
        timeout=60
    )

    if diff_code != 0:
        raise HTTPException(status_code=500, detail=f"Failed to get PR diff: {diff_stderr}")

    # Parse unified diff into per-file patches
    file_patches: dict[str, str] = {}
    current_file = None
    current_patch_lines: list[str] = []

    for line in diff_stdout.split("\n"):
        if line.startswith("diff --git"):
            if current_file:
                file_patches[current_file] = "\n".join(current_patch_lines)
            parts = line.split(" b/", 1)
            current_file = parts[1] if len(parts) > 1 else None
            current_patch_lines = [line]
        elif current_file:
            current_patch_lines.append(line)

    if current_file:
        file_patches[current_file] = "\n".join(current_patch_lines)

    files = []
    for fname in filenames:
        patch = file_patches.get(fname, "")
        additions = 0
        deletions = 0
        for pline in patch.split("\n"):
            if pline.startswith("+") and not pline.startswith("+++"):
                additions += 1
            elif pline.startswith("-") and not pline.startswith("---"):
                deletions += 1

        status = "modified"
        if "--- /dev/null" in patch:
            status = "added"
        elif "+++ /dev/null" in patch:
            status = "deleted"
        elif "rename from" in patch:
            status = "renamed"

        files.append(PRChangedFile(
            filename=fname,
            status=status,
            additions=additions,
            deletions=deletions,
            patch=patch,
        ))

    return PRFilesResponse(files=files, count=len(files))


# ============================================================================
# PR Review Action Endpoints (Phase 2)
# ============================================================================

@router.post("/{project_id}/pulls/{pr_number}/comment")
async def add_pr_comment(
    project_id: str,
    pr_number: int,
    request: PRCommentRequest,
    _: str = Depends(verify_api_key),
):
    """Add a comment to a pull request."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    stdout, stderr, code = run_gh_command(
        project_path,
        ["pr", "comment", str(pr_number), "--body", request.body]
    )

    if code != 0:
        raise HTTPException(status_code=400, detail=f"Failed to add comment: {stderr}")

    return {"success": True, "message": "Comment added"}


@router.post("/{project_id}/pulls/{pr_number}/review")
async def submit_pr_review(
    project_id: str,
    pr_number: int,
    request: PRReviewRequest,
    _: str = Depends(verify_api_key),
):
    """Submit a review on a pull request."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    args = ["pr", "review", str(pr_number)]

    if request.event == "approve":
        args.append("--approve")
    elif request.event == "request_changes":
        args.append("--request-changes")
    elif request.event == "comment":
        args.append("--comment")
    else:
        raise HTTPException(status_code=400, detail=f"Invalid review event: {request.event}")

    if request.body:
        args.extend(["--body", request.body])

    stdout, stderr, code = run_gh_command(project_path, args)

    if code != 0:
        raise HTTPException(status_code=400, detail=f"Failed to submit review: {stderr}")

    return {"success": True, "message": f"Review submitted: {request.event}"}


@router.post("/{project_id}/pulls/{pr_number}/close")
async def close_pull_request(
    project_id: str,
    pr_number: int,
    _: str = Depends(verify_api_key),
):
    """Close a pull request."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    stdout, stderr, code = run_gh_command(
        project_path,
        ["pr", "close", str(pr_number)]
    )

    if code != 0:
        raise HTTPException(status_code=400, detail=f"Failed to close PR: {stderr}")

    return {"success": True, "message": f"PR #{pr_number} closed"}


@router.post("/{project_id}/pulls/{pr_number}/merge")
async def merge_pull_request(
    project_id: str,
    pr_number: int,
    request: PRMergeRequest,
    _: str = Depends(verify_api_key),
):
    """Merge a pull request."""
    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    args = ["pr", "merge", str(pr_number)]

    if request.method == "squash":
        args.append("--squash")
    elif request.method == "rebase":
        args.append("--rebase")
    else:
        args.append("--merge")

    stdout, stderr, code = run_gh_command(project_path, args)

    if code != 0:
        raise HTTPException(status_code=400, detail=f"Failed to merge PR: {stderr}")

    return {"success": True, "message": f"PR #{pr_number} merged via {request.method}"}


# ============================================================================
# GitHub Sync Endpoint (Phase 4)
# ============================================================================

@router.post("/{project_id}/sync")
async def sync_github_state(
    project_id: str,
    _: str = Depends(verify_api_key),
):
    """Check linked GitHub issues and sync task status."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

    project_path = get_project_path(project_id)
    if not project_path:
        raise HTTPException(status_code=404, detail="Project not found")

    proj_result = supabase.table("projects").select("settings").eq("id", project_id).execute()
    if not proj_result.data:
        raise HTTPException(status_code=404, detail="Project not found")

    settings = (proj_result.data[0].get("settings") or {}).get("github", {})
    if not settings.get("sync_issues", False):
        return {"synced": [], "count": 0, "message": "Issue sync is disabled for this project"}

    tasks_result = (
        supabase.table("tasks")
        .select("id,title,status,context")
        .eq("project_id", project_id)
        .neq("status", "done")
        .neq("status", "failed")
        .execute()
    )

    synced = []
    for task in tasks_result.data or []:
        context = task.get("context") or {}
        github_info = context.get("github", {})
        linked_issue = github_info.get("linked_issue")
        repo_url = github_info.get("repo_url")

        if not linked_issue or not repo_url:
            continue

        owner, repo = parse_remote_url(repo_url)
        if not owner or not repo:
            continue

        stdout, stderr, code = run_gh_command(
            project_path,
            ["issue", "view", str(linked_issue), "--repo", f"{owner}/{repo}", "--json", "state"]
        )

        if code != 0:
            continue

        try:
            issue_data = json.loads(stdout)
        except json.JSONDecodeError:
            continue

        issue_state = issue_data.get("state", "").lower()

        if issue_state == "closed" and task["status"] != "done":
            supabase.table("tasks").update({
                "status": "done",
                "result": f"Auto-completed: linked GitHub issue #{linked_issue} was closed.",
                "completed_at": datetime.utcnow().isoformat(),
            }).eq("id", task["id"]).execute()

            synced.append({
                "task_id": task["id"],
                "task_title": task["title"],
                "issue_number": linked_issue,
                "action": "completed",
            })

    return {"synced": synced, "count": len(synced)}
