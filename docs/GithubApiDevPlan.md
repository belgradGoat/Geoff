# GitHub API Integration Development Plan

## Executive Summary

This document evaluates the feasibility of adding GitHub API features to Geoff (AgentTaskPlanner), including push/pull operations, branch management, and pull request integration. It identifies potential UI locations for these features and provides implementation recommendations.

**Verdict: HIGHLY FEASIBLE** - The existing architecture is well-suited for GitHub integration with minimal modifications required.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [GitHub API Capabilities](#2-github-api-capabilities)
3. [Proposed Features](#3-proposed-features)
4. [UI Integration Locations](#4-ui-integration-locations)
5. [Technical Architecture](#5-technical-architecture)
6. [Database Schema Changes](#6-database-schema-changes)
7. [Implementation Phases](#7-implementation-phases)
8. [Security Considerations](#8-security-considerations)
9. [Challenges & Mitigations](#9-challenges--mitigations)
10. [Recommendations](#10-recommendations)

---

## 1. Current State Analysis

### 1.1 Existing Git-Related Functionality

The current codebase has **minimal Git integration**:

| Feature | Status | Location |
|---------|--------|----------|
| Project detection via `.git` folder | Implemented | `orchestrator/src/orchestrator/api/projects.py` |
| Display of project path | Implemented | `ProjectSelector.tsx`, `FileBrowser.tsx` |
| Git status/operations | **Not implemented** | - |
| GitHub API calls | **Not implemented** | - |

### 1.2 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ TaskDetail  │  │ FileBrowser │  │ ProjectSelector         │ │
│  │             │  │             │  │                         │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                     │                │
│         └────────────────┼─────────────────────┘                │
│                          │                                      │
│                   ┌──────┴──────┐                               │
│                   │ orchestrator │ (lib/orchestrator.ts)        │
│                   └──────┬──────┘                               │
└──────────────────────────┼──────────────────────────────────────┘
                           │ HTTP/WebSocket
┌──────────────────────────┼──────────────────────────────────────┐
│                    ORCHESTRATOR (FastAPI)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ agents.py   │  │filesystem.py│  │ projects.py             │ │
│  │             │  │             │  │ [+ github.py NEW]       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                     MCP SERVER (Python)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ tools.py - Task/Project tools                           │   │
│  │ [+ GitHub tools: github_get_status, github_create_pr]   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Integration Points

1. **Frontend API Client** (`web/src/lib/orchestrator.ts`)
   - Easy to extend with new GitHub-related functions
   - Follows established patterns for async calls

2. **Orchestrator Backend** (`orchestrator/src/orchestrator/api/`)
   - New `github.py` module can follow existing patterns
   - Security middleware already in place

3. **MCP Server** (`mcp-server/src/agent_task_planner/tools.py`)
   - Tools can be added for Claude agents to use GitHub features
   - Database integration already established

4. **Database** (`supabase/schema.sql`)
   - Projects table has `settings JSONB` field for storing GitHub config
   - Tasks table has `context JSONB` for linking to issues/PRs

---

## 2. GitHub API Capabilities

### 2.1 Available API Endpoints

Based on [GitHub REST API documentation](https://docs.github.com/en/rest):

| Category | Endpoints | Authentication Required |
|----------|-----------|------------------------|
| **Repositories** | Get repo info, list branches, get README | Public repos: No; Private: Yes |
| **Commits** | List commits, get commit details, compare commits | Public repos: No; Private: Yes |
| **Branches** | List branches, get branch, branch protection | Public repos: No; Private: Yes |
| **Pull Requests** | List PRs, create PR, update PR, merge PR | Yes |
| **Issues** | List issues, create issue, update issue | Yes |
| **Git Database** | Create blobs, trees, commits, refs | Yes |
| **Contents** | Get file contents, create/update files | Yes |

### 2.2 Push/Pull Without Git Clone

Two approaches are available for committing without local Git:

#### Approach A: Git Database API (Low-Level)

From [API Hero](https://blog.apihero.run/how-to-programmatically-create-a-commit-on-github) and [Levi Botelho's Blog](https://www.levibotelho.com/development/commit-a-file-with-the-github-api/):

1. Get latest commit SHA (`GET /repos/{owner}/{repo}/git/refs/heads/{branch}`)
2. Create blob(s) for files (`POST /repos/{owner}/{repo}/git/blobs`)
3. Create tree with file references (`POST /repos/{owner}/{repo}/git/trees`)
4. Create commit pointing to tree (`POST /repos/{owner}/{repo}/git/commits`)
5. Update branch reference (`PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}`)

#### Approach B: GraphQL createCommitOnBranch (Simpler)

From [GitHub Blog](https://github.blog/changelog/2021-09-13-a-simpler-api-for-authoring-commits/):

- Single mutation to add, update, or delete multiple files
- No need to manually create blobs/trees
- Recommended for most use cases

### 2.3 Rate Limits

| Authentication | Limit |
|----------------|-------|
| Unauthenticated | 60 requests/hour |
| Personal Access Token | 5,000 requests/hour |
| GitHub App | 5,000+ requests/hour |

**Recommendation**: Use Personal Access Tokens (PATs) stored securely in project settings.

---

## 3. Proposed Features

### 3.1 Feature Categories

#### Category A: Read-Only Features (Low Complexity)
- [ ] Display repository status (branch, last commit, uncommitted changes)
- [ ] Show recent commits
- [ ] List branches
- [ ] View pull requests
- [ ] View issues

#### Category B: Write Features (Medium Complexity)
- [ ] Create branches
- [ ] Create pull requests from current branch
- [ ] Create issues from tasks
- [ ] Add comments to PRs/issues

#### Category C: Advanced Features (High Complexity)
- [ ] Push changes via API (without local Git)
- [ ] Sync task status with GitHub issues
- [ ] Auto-create PR when agent completes a task
- [ ] Link commits to tasks

### 3.2 Feature Priority Matrix

| Feature | User Value | Complexity | Priority |
|---------|------------|------------|----------|
| Git status display | High | Low | **P0** |
| Branch listing | Medium | Low | **P1** |
| PR listing/creation | High | Medium | **P1** |
| Issue linking | High | Medium | **P1** |
| Commit history | Medium | Low | **P2** |
| Push via API | Medium | High | **P3** |
| Auto-PR on task complete | High | High | **P3** |

---

## 4. UI Integration Locations

### 4.1 Task Screen (`TaskDetail.tsx`)

**Current Structure:**
```
┌─────────────────────────────────────┐
│ × Close                  Edit Delete │
├─────────────────────────────────────┤
│ Task Title                          │
│ Description                         │
├─────────────────────────────────────┤
│ Status: ready    Priority: 1       │
│ Complexity: medium  Progress: 0%   │
│ Assigned Agent: claude-abc123      │
├─────────────────────────────────────┤
│ Attachments (2)                     │
│ └─ [attachment list]               │
├─────────────────────────────────────┤
│ Created: Jan 31, 2026              │
│ Updated: Feb 1, 2026               │
└─────────────────────────────────────┘
```

**Proposed GitHub Section:**
```
├─────────────────────────────────────┤
│ GitHub Context                       │
│ ├─ Linked Issue: #42 (Open)        │
│ │   └─ [Create Issue] [Link Issue] │
│ ├─ Linked PR: #55 (Open)           │
│ │   └─ [Create PR] [Link PR]       │
│ └─ Related Commits: 3              │
│     └─ abc123 "Fix auth bug"       │
├─────────────────────────────────────┤
```

**Implementation Location:** Add new `<GitHubContext>` component inside `TaskDetail.tsx` after the metadata section.

### 4.2 File Browser Tab (`FileBrowser.tsx`)

**Current Structure:**
```
┌─────────────────────────────────────┐
│ File Browser      [+ New Folder] [] │
│ [Quick paths: Desktop, Documents...]│
│ ┌─ /Users/me/project               │
│ ├──────────────────────────────────┤
│ │ Name          Size    Modified   │
│ ├──────────────────────────────────┤
│ │ 📁 src        --      Jan 31     │
│ │ 📄 README.md  2.1 KB  Jan 30     │
└─────────────────────────────────────┘
```

**Proposed Git Status Bar:**
```
┌─────────────────────────────────────┐
│ File Browser      [+ New Folder] [] │
├─────────────────────────────────────┤
│ 🌿 main │ 3 modified │ 2 untracked │
│ [Pull] [Commit] [Push] [Branches ▼] │
├─────────────────────────────────────┤
│ [Quick paths...]                    │
```

**Implementation Location:** Add new `<GitStatusBar>` component at the top of `FileBrowser.tsx`, conditionally rendered when project is a Git repo.

### 4.3 Project Selector (`ProjectSelector.tsx`)

**Current Structure:**
```
┌─────────────────────────────────────┐
│ Project                 [Scan Folder]│
│ ┌───────────────────────────────┐  │
│ │ All Projects              ▼   │  │
│ └───────────────────────────────┘  │
│ /Users/me/Documents/GitHub/MyApp   │
└─────────────────────────────────────┘
```

**Proposed GitHub Info:**
```
┌─────────────────────────────────────┐
│ Project                 [Scan Folder]│
│ ┌───────────────────────────────┐  │
│ │ MyApp (main)              ▼   │  │
│ └───────────────────────────────┘  │
│ github.com/user/myapp              │
│ 🟢 2 Open PRs │ 5 Open Issues     │
│ [Configure GitHub Token]           │
└─────────────────────────────────────┘
```

**Implementation Location:** Extend `ProjectSelector.tsx` with GitHub metadata display and token configuration modal.

### 4.4 Settings Tab (`RemoteAccess.tsx`)

**Current Structure:** System info, Tailscale IP, setup instructions

**Proposed Addition: GitHub Settings Section**
```
├─────────────────────────────────────┤
│ GitHub Integration                  │
│                                     │
│ Default Token: ••••••••ghp_abc     │
│ [Update Token]                      │
│                                     │
│ Per-Project Tokens:                 │
│ ├─ AgentTaskPlanner: ••••••ghp_xyz │
│ └─ MyOtherProject: (using default) │
│                                     │
│ Permissions Required:               │
│ • repo (Full repository access)    │
│ • workflow (optional, for actions) │
└─────────────────────────────────────┘
```

**Implementation Location:** Add new `<GitHubSettings>` component alongside `RemoteAccess.tsx` in the Settings tab.

### 4.5 New Tab Consideration: GitHub Tab

For comprehensive GitHub features, consider adding a dedicated **GitHub tab**:

```
[Tasks] [Files] [GitHub] [Settings]
                  ↑ NEW
```

**GitHub Tab Contents:**
- Repository overview
- Branch manager
- Pull request list
- Issue list
- Commit history
- GitHub Actions status

**Recommendation:** Start by adding features to existing tabs. Consider a dedicated tab only if the features become too numerous for inline integration.

### 4.6 Agent Panel (`AgentPanel.tsx`)

**Potential Enhancement:** Show Git context when launching agents

```
┌─────────────────────────────────────┐
│ Agent Orchestrator                  │
├─────────────────────────────────────┤
│ [Custom prompt...]                  │
│                                     │
│ Project: MyApp (main branch)        │
│ ☑ Include Git context in prompt    │
│ ☑ Allow agent to create PRs        │
│                                     │
│ [Launch]                            │
└─────────────────────────────────────┘
```

---

## 5. Technical Architecture

### 5.1 New Frontend Components

```
web/src/components/
├── github/
│   ├── GitHubSettings.tsx      # Token management
│   ├── GitStatusBar.tsx        # Branch/status display
│   ├── GitHubContext.tsx       # Task-linked GitHub info
│   ├── BranchSelector.tsx      # Branch dropdown
│   ├── PullRequestList.tsx     # PR listing
│   ├── IssueList.tsx           # Issue listing
│   └── CommitHistory.tsx       # Recent commits
```

### 5.2 New Backend Endpoints (Orchestrator)

```
orchestrator/src/orchestrator/api/
├── github.py                   # NEW FILE
    │
    ├── GET  /api/github/{project_id}/status
    │   → Returns: branch, modified files, untracked count
    │
    ├── GET  /api/github/{project_id}/branches
    │   → Returns: list of branches with current indicator
    │
    ├── GET  /api/github/{project_id}/commits
    │   → Returns: recent commits (paginated)
    │
    ├── GET  /api/github/{project_id}/pulls
    │   → Returns: open PRs
    │
    ├── POST /api/github/{project_id}/pulls
    │   → Creates: new PR
    │
    ├── GET  /api/github/{project_id}/issues
    │   → Returns: open issues
    │
    ├── POST /api/github/{project_id}/issues
    │   → Creates: new issue
    │
    └── POST /api/github/validate-token
        → Validates: GitHub PAT
```

### 5.3 New MCP Tools (For Claude Agents)

```python
# mcp-server/src/agent_task_planner/tools.py

@mcp.tool()
def github_get_status(project_id: str) -> dict:
    """Get Git status for a project."""

@mcp.tool()
def github_list_branches(project_id: str) -> list:
    """List branches in the repository."""

@mcp.tool()
def github_create_branch(project_id: str, branch_name: str, from_branch: str = "main") -> dict:
    """Create a new branch."""

@mcp.tool()
def github_create_pr(project_id: str, title: str, body: str, head: str, base: str = "main") -> dict:
    """Create a pull request."""

@mcp.tool()
def github_create_issue(project_id: str, title: str, body: str, labels: list = None) -> dict:
    """Create a GitHub issue."""

@mcp.tool()
def github_link_task_to_issue(task_id: str, issue_number: int) -> dict:
    """Link a task to a GitHub issue."""

@mcp.tool()
def github_link_task_to_pr(task_id: str, pr_number: int) -> dict:
    """Link a task to a pull request."""
```

### 5.4 API Client Extension

```typescript
// web/src/lib/orchestrator.ts

// Add these new interfaces
export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  modified: string[]
  untracked: string[]
  staged: string[]
}

export interface GitBranch {
  name: string
  is_current: boolean
  last_commit: string
  last_commit_date: string
}

export interface PullRequest {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  author: string
  created_at: string
  url: string
}

export interface GitHubIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  labels: string[]
  created_at: string
  url: string
}

// Add these new methods to orchestrator object
async getGitStatus(projectId: string): Promise<GitStatus> { ... }
async listBranches(projectId: string): Promise<GitBranch[]> { ... }
async listPullRequests(projectId: string): Promise<PullRequest[]> { ... }
async createPullRequest(projectId: string, data: CreatePRRequest): Promise<PullRequest> { ... }
async listIssues(projectId: string): Promise<GitHubIssue[]> { ... }
async createIssue(projectId: string, data: CreateIssueRequest): Promise<GitHubIssue> { ... }
async validateGitHubToken(token: string): Promise<{ valid: boolean; scopes: string[] }> { ... }
```

---

## 6. Database Schema Changes

### 6.1 Projects Table Extension

The existing `settings JSONB` field can store GitHub configuration:

```json
{
  "github": {
    "token": "ghp_encrypted_token_here",
    "repo_url": "https://github.com/user/repo",
    "owner": "user",
    "repo": "repo",
    "default_branch": "main",
    "auto_create_pr": false,
    "sync_issues": true
  }
}
```

### 6.2 Tasks Table Extension

The existing `context JSONB` field can store GitHub links:

```json
{
  "github": {
    "linked_issue": 42,
    "linked_pr": 55,
    "related_commits": ["abc123", "def456"],
    "branch": "feature/task-123"
  }
}
```

### 6.3 Optional: New GitHub Cache Table

For performance, consider caching GitHub data:

```sql
CREATE TABLE github_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    cache_type TEXT NOT NULL, -- 'status', 'branches', 'prs', 'issues'
    data JSONB NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_github_cache_project ON github_cache(project_id);
CREATE INDEX idx_github_cache_type ON github_cache(cache_type);
```

---

## 7. Implementation Phases

### Phase 1: Foundation (P0)
**Goal:** Basic Git status display and GitHub token management

**Tasks:**
1. Add GitHub settings component to Settings tab
2. Implement token storage in project settings (encrypted)
3. Add `GitStatusBar` component to File Browser
4. Create `/api/github/{project_id}/status` endpoint
5. Display branch name and modified file count

**Deliverables:**
- Users can configure GitHub tokens
- File Browser shows current branch and basic status

### Phase 2: Read Operations (P1)
**Goal:** View GitHub data (branches, PRs, issues)

**Tasks:**
1. Add branch listing API and UI
2. Add PR listing API and UI
3. Add issue listing API and UI
4. Create `GitHubContext` component for TaskDetail
5. Implement issue/PR linking to tasks

**Deliverables:**
- Users can view branches, PRs, and issues
- Tasks can be linked to GitHub issues/PRs

### Phase 3: Write Operations (P2)
**Goal:** Create branches, PRs, and issues

**Tasks:**
1. Implement branch creation API
2. Implement PR creation API and UI
3. Implement issue creation from task
4. Add MCP tools for Claude agents

**Deliverables:**
- Users can create branches and PRs from UI
- Agents can create PRs/issues programmatically

### Phase 4: Advanced Integration (P3)
**Goal:** Deep task-GitHub synchronization

**Tasks:**
1. Auto-create PR when agent completes task
2. Sync issue status with task status
3. Link commits to tasks
4. Consider push-via-API feature

**Deliverables:**
- Automated workflows between tasks and GitHub

---

## 8. Security Considerations

### 8.1 Token Storage

**Requirements:**
- Tokens must be encrypted at rest
- Tokens should never be exposed in API responses
- Use Supabase's encryption features or application-level encryption

**Implementation:**
```python
from cryptography.fernet import Fernet

def encrypt_token(token: str, key: bytes) -> str:
    f = Fernet(key)
    return f.encrypt(token.encode()).decode()

def decrypt_token(encrypted: str, key: bytes) -> str:
    f = Fernet(key)
    return f.decrypt(encrypted.encode()).decode()
```

### 8.2 Token Scopes

**Minimum Required Scopes:**
- `repo` - Full repository access (read/write)
- `read:user` - Read user profile

**Optional Scopes:**
- `workflow` - For GitHub Actions integration
- `admin:org` - For organization-level features

### 8.3 Rate Limit Handling

```python
def github_request_with_retry(url: str, token: str, max_retries: int = 3):
    for attempt in range(max_retries):
        response = requests.get(url, headers={"Authorization": f"token {token}"})

        if response.status_code == 403:
            remaining = int(response.headers.get("X-RateLimit-Remaining", 0))
            if remaining == 0:
                reset_time = int(response.headers.get("X-RateLimit-Reset", 0))
                wait_seconds = reset_time - time.time()
                if wait_seconds > 0 and wait_seconds < 60:
                    time.sleep(wait_seconds)
                    continue

        return response

    raise RateLimitExceeded()
```

---

## 9. Challenges & Mitigations

### 9.1 Challenge: Git Operations Without Local Git

**Problem:** Some features (like `git status`) traditionally require a local Git binary.

**Mitigation Options:**
1. **Use local Git via subprocess** - Simple, reliable, requires Git installed
2. **Use GitHub API only** - More complex, but works without local Git
3. **Hybrid approach** - Use local Git when available, fall back to API

**Recommendation:** Use local Git for status/branch operations (fast, reliable) and GitHub API for PR/issue operations.

### 9.2 Challenge: Token Management for Multiple Projects

**Problem:** Users may have different tokens for different repositories (personal vs. work).

**Mitigation:**
- Store per-project tokens in project settings
- Fall back to a global default token
- Clear UI showing which token is in use

### 9.3 Challenge: Real-Time Updates

**Problem:** GitHub data changes externally; how to keep UI current?

**Mitigation:**
1. Implement polling with configurable interval (30s default)
2. Add manual refresh button
3. Use caching with TTL to reduce API calls
4. Consider GitHub webhooks for advanced real-time sync

### 9.4 Challenge: Large Repositories

**Problem:** Listing all branches/commits could be slow for large repos.

**Mitigation:**
1. Implement pagination
2. Show only recent/active branches
3. Cache results with appropriate TTL
4. Add loading states and partial rendering

---

## 10. Recommendations

### 10.1 Immediate Actions

1. **Start with Phase 1** - Git status display provides immediate user value with low complexity
2. **Use local Git** for status operations - Reliable and fast
3. **Use GitHub API** for PR/issue operations - Standard approach
4. **Store tokens encrypted** - Security first

### 10.2 Library Recommendations

**Python (Orchestrator):**
- `PyGithub` - Well-maintained GitHub API wrapper
- `gitpython` - For local Git operations
- `cryptography` - For token encryption

**TypeScript (Frontend):**
- `@octokit/rest` - Official GitHub API client (if needed client-side)
- Native `fetch` is sufficient for orchestrator communication

### 10.3 Testing Strategy

1. **Unit tests** for API endpoints with mocked GitHub responses
2. **Integration tests** with a test repository
3. **E2E tests** for critical flows (token setup, PR creation)

### 10.4 Documentation Updates

When implemented, update:
- `docs/userguide.md` - How to set up GitHub integration
- `docs/developerguide.md` - API endpoint documentation
- Add `docs/github-integration.md` - Detailed feature guide

---

## Appendix A: Related Resources

- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [GitHub REST API - Pull Requests](https://docs.github.com/en/rest/pulls/pulls)
- [GitHub REST API - Commits](https://docs.github.com/en/rest/commits/commits)
- [GitHub REST API - Branches](https://docs.github.com/en/rest/branches/branches)
- [How to programmatically create commits on GitHub](https://blog.apihero.run/how-to-programmatically-create-a-commit-on-github)
- [Commit a file with the GitHub API](https://www.levibotelho.com/development/commit-a-file-with-the-github-api/)
- [git-commit-push-via-github-api (npm package)](https://github.com/azu/git-commit-push-via-github-api)
- [GitHub Simpler Commit API (GraphQL)](https://github.blog/changelog/2021-09-13-a-simpler-api-for-authoring-commits/)

---

## Appendix B: Sample API Response Structures

### Git Status Response
```json
{
  "branch": "main",
  "ahead": 2,
  "behind": 0,
  "modified": ["src/App.tsx", "package.json"],
  "untracked": ["new-file.ts"],
  "staged": ["README.md"]
}
```

### Pull Request List Response
```json
{
  "pull_requests": [
    {
      "number": 42,
      "title": "Add dark mode toggle",
      "state": "open",
      "author": "username",
      "created_at": "2026-01-30T10:00:00Z",
      "url": "https://github.com/user/repo/pull/42",
      "head_branch": "feature/dark-mode",
      "base_branch": "main"
    }
  ],
  "total": 5
}
```

### Issue List Response
```json
{
  "issues": [
    {
      "number": 15,
      "title": "Bug: Login form validation",
      "state": "open",
      "labels": ["bug", "priority-high"],
      "assignees": ["username"],
      "created_at": "2026-01-28T14:30:00Z",
      "url": "https://github.com/user/repo/issues/15"
    }
  ],
  "total": 10
}
```

---

*Document created: February 1, 2026*
*Author: Claude Agent (claude-opus-4.5-main)*
*Status: DRAFT - Ready for Review*
