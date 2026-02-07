# Pull Requests & GitHub Sync - Development Plan

## Overview

This plan covers the next iteration of GitHub integration:

1. **Dedicated GitHub Tab** — A central dashboard for all GitHub activity, added as the 4th tab.
2. **PR Review Dashboard** — Incoming PRs appear in the app. The user can view details, assign an agent to work on them, or reject them.
3. **Task ↔ Issue Bidirectional Sync** — Closing a task closes the linked GitHub issue, and vice versa.

---

## Current State

Already implemented:
- PR listing with state filters (open/closed/all)
- PR creation form (title, description, branches)
- Issue listing and creation
- Task-GitHub linking via MCP tools (`task_link_to_issue`, `task_link_to_pr`)
- `GitHubContext` component showing linked issue/PR on tasks
- GitHub token management and validation
- Git status bar in File Browser (branch, modified files, push/pull)
- All operations use `gh` CLI under the hood

What's missing:
- No dedicated screen for GitHub — components are scattered across tabs
- No way to view PR details (diff, changed files, comments)
- No way to review/approve/reject PRs from the app
- No "assign to agent" action on PRs
- No automatic sync between task status and GitHub issue status
- No notification or polling for new PRs

---

## Phase 0: Dedicated GitHub Tab

### Goal

Create a central GitHub dashboard as the 4th tab in the navigation: **Tasks | Chat | GitHub | Files | Settings**

The tab consolidates all GitHub activity into one screen while keeping contextual integrations where they are:
- **GitStatusBar stays in File Browser** — contextual to file browsing
- **GitHubContext stays in TaskDetail** — contextual to the task
- **GitHubSettings stays in Settings** — configuration belongs there

### Tab Layout

```
┌─────────────────────────────────────────────────┐
│  [ProjectSelector]                              │
├─────────────────────────────────────────────────┤
│  [GitStatusBar]  (branch, status, push/pull)    │
├──────────────────────┬──────────────────────────┤
│                      │                          │
│   Pull Requests      │   Issues                 │
│   (PullRequestList)  │   (IssueList)            │
│                      │                          │
├──────────────────────┴──────────────────────────┤
│                                                 │
│   Recent Commits (CommitHistory)                │
│                                                 │
├─────────────────────────────────────────────────┤
│   Active Sessions (AgentPanel)                  │
└─────────────────────────────────────────────────┘
```

On mobile, the two-column layout (PRs | Issues) stacks vertically.

### Implementation

**Modify `web/src/App.tsx`:**

1. Add `'github'` to the `Tab` type union:
   ```typescript
   type Tab = 'tasks' | 'files' | 'settings' | 'chat' | 'github'
   ```

2. Add the tab to the `tabs` array (position 3, between Chat and Files):
   ```typescript
   const tabs: { id: Tab; label: string }[] = [
     { id: 'tasks', label: 'Tasks' },
     { id: 'chat', label: 'Chat' },
     { id: 'github', label: 'GitHub' },
     { id: 'files', label: 'Files' },
     { id: 'settings', label: 'Settings' },
   ]
   ```

3. Update `getStoredTab()` to include `'github'` in the valid tab list.

4. Add the tab content section:
   ```tsx
   {activeTab === 'github' && (
     <div className="space-y-6">
       <ProjectSelector />
       <GitStatusBar projectId={projectFilter} />

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <PullRequestList projectId={projectFilter} />
         <IssueList projectId={projectFilter} />
       </div>

       <CommitHistory projectId={projectFilter} />
       <AgentPanel />
     </div>
   )}
   ```

5. Add imports for `PullRequestList`, `IssueList`, `CommitHistory`, `GitStatusBar`.

**Create `web/src/components/github/GitHubTab.tsx`** (optional):

If the tab layout grows complex, extract it into its own component to keep `App.tsx` clean. For now, inline in `App.tsx` is fine — matches the pattern used by all other tabs.

**Files to modify:**
- `web/src/App.tsx` — Add tab definition and content

**Estimated complexity:** Trivial — all components already exist, this is just composition.

---

## Phase 1: PR Detail View

When a user clicks on a PR in the `PullRequestList`, open a detail modal showing the full PR.

### What the user sees

- **Header:** PR title, number, state badge, author, created date
- **Description:** Full PR body (markdown rendered)
- **Branch info:** `head_branch` → `base_branch` with merge status
- **Changed files list:** File names with additions/deletions counts
- **Diff viewer:** Expandable per-file diffs with syntax highlighting
- **Comments thread:** Existing review comments
- **Action buttons:** Approve, Request Changes, Close, Assign to Agent

### New Backend Endpoints

```
GET /api/github/{project_id}/pulls/{pr_number}
  → Full PR details (description, mergeable status, review status, labels)
  Uses: gh pr view {pr_number} --json title,body,state,author,additions,deletions,...

GET /api/github/{project_id}/pulls/{pr_number}/files
  → List of changed files with patch/diff content
  Uses: gh pr diff {pr_number}

GET /api/github/{project_id}/pulls/{pr_number}/comments
  → Review comments and inline comments
  Uses: gh pr view {pr_number} --json comments,reviews
```

### New Frontend Components

```
web/src/components/github/
├── PRDetailModal.tsx      # Full PR detail view with tabs
├── PRDiffViewer.tsx       # File diff display with syntax coloring
├── PRComments.tsx         # Comment thread display
└── PRActions.tsx          # Action buttons (approve, reject, assign)
```

### New TypeScript Interfaces

```typescript
interface PullRequestDetail extends PullRequest {
  body: string
  additions: number
  deletions: number
  changed_files: number
  mergeable: boolean
  review_status: string        // 'approved' | 'changes_requested' | 'pending'
  labels: string[]
  reviews: PRReview[]
  comments: PRComment[]
}

interface PRChangedFile {
  filename: string
  status: string               // 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  patch: string                // unified diff content
}

interface PRComment {
  id: number
  author: string
  body: string
  created_at: string
  path?: string                // file path for inline comments
  line?: number                // line number for inline comments
}

interface PRReview {
  id: number
  author: string
  state: string                // 'approved' | 'changes_requested' | 'commented'
  body: string
  submitted_at: string
}
```

### Integration with GitHub Tab

The `PullRequestList` on the GitHub tab becomes the entry point. Clicking a PR card opens `PRDetailModal` as a full-width overlay. On mobile, the modal takes the full screen.

**Files to create/modify:**
- `orchestrator/src/orchestrator/api/github.py` — Add 3 new endpoints
- `web/src/lib/orchestrator.ts` — Add client methods
- `web/src/components/github/PRDetailModal.tsx` — New component
- `web/src/components/github/PRDiffViewer.tsx` — New component
- `web/src/components/github/PRComments.tsx` — New component
- `web/src/components/github/PullRequestList.tsx` — Make PR cards clickable

**Estimated complexity:** Medium

---

## Phase 2: PR Review Actions

Allow the user to take action on PRs directly from the detail modal.

### New Backend Endpoints

```
POST /api/github/{project_id}/pulls/{pr_number}/comment
  Body: { body: string }
  → Adds a comment to the PR
  Uses: gh pr comment {pr_number} --body "..."

POST /api/github/{project_id}/pulls/{pr_number}/review
  Body: { event: 'approve' | 'request_changes' | 'comment', body?: string }
  → Submits a review
  Uses: gh pr review {pr_number} --approve / --request-changes --body "..."

POST /api/github/{project_id}/pulls/{pr_number}/close
  → Closes the PR
  Uses: gh pr close {pr_number}

POST /api/github/{project_id}/pulls/{pr_number}/merge
  Body: { method?: 'merge' | 'squash' | 'rebase' }
  → Merges the PR
  Uses: gh pr merge {pr_number} --merge/--squash/--rebase
```

### Frontend Actions in PRDetailModal

- **Approve** — Green button, submits approval review
- **Request Changes** — Orange button, opens text area for feedback, submits review
- **Comment** — Adds a general comment without approving/rejecting
- **Close** — Red button with confirmation dialog, closes the PR
- **Merge** — Green button (only shown if approved & mergeable), dropdown for merge method

**Files to create/modify:**
- `orchestrator/src/orchestrator/api/github.py` — Add 4 new endpoints
- `web/src/lib/orchestrator.ts` — Add client methods
- `web/src/components/github/PRActions.tsx` — New component
- `web/src/components/github/PRDetailModal.tsx` — Integrate actions

**Estimated complexity:** Small-Medium

---

## Phase 3: Assign PR to Agent

The core feature: take an incoming PR and spin up an agent to work on it.

### User Flow

1. User opens the GitHub tab and sees a PR
2. Clicks the PR to open the detail modal
3. Clicks **"Assign to Agent"** button
4. A dialog appears with options:
   - **Review & Comment** — Agent reads the diff, leaves a code review with suggestions
   - **Fix Issues** — Agent checks out the PR branch, makes fixes, pushes commits
   - **Custom Prompt** — User types what they want the agent to do with this PR
5. User confirms → a task is created and linked to the PR → agent launches
6. Agent progress is visible in the AgentPanel at the bottom of the GitHub tab

### Preset Prompt Templates

```
Review & Comment:
"Review PR #{number} titled '{title}'. Read the diff, analyze the code changes,
and leave a detailed review with suggestions for improvement. Use the GitHub
PR comment functionality to provide feedback. Link your work to this PR using
task_link_to_pr."

Fix Issues:
"Check out branch '{head_branch}' for PR #{number} titled '{title}'.
Review the changes, fix any issues you find (bugs, style problems, missing
error handling), commit your fixes, and push to the branch. Use task_link_to_pr
to link your work."

Custom:
User-provided prompt + context about the PR automatically prepended.
```

### Task Creation Flow

```
1. Create task via orchestrator API:
   - title: "PR #{number}: {action} - {pr_title}"
   - description: Full PR context + chosen prompt
   - context.github.linked_pr: pr_number
   - context.github.branch: head_branch
   - context.github.repo_url: repo_url

2. Launch agent with:
   - prompt: Selected template with PR details injected
   - working_dir: project path
   - projectId: current project

3. Agent executes:
   - Claims the task
   - Performs the requested action
   - Links commits via task_add_commit
   - Marks task complete
```

### New Components & Methods

**New component:** `web/src/components/github/AssignToAgentDialog.tsx`
- Radio buttons for action type (Review / Fix / Custom)
- Text area for custom prompt (shown when Custom is selected)
- Context preview showing PR title and branch
- "Launch Agent" confirmation button

**New orchestrator.ts method:**

```typescript
async assignPRToAgent(
  projectId: string,
  prNumber: number,
  action: 'review' | 'fix' | 'custom',
  customPrompt?: string
): Promise<{ taskId: string; agentId: string }>
```

This method:
1. Fetches PR details for context
2. Creates a task linked to the PR
3. Launches an agent with the appropriate prompt
4. Returns both IDs for the frontend to track

**Files to create/modify:**
- `web/src/components/github/AssignToAgentDialog.tsx` — New component
- `web/src/lib/orchestrator.ts` — Add `assignPRToAgent` method
- `web/src/components/github/PRDetailModal.tsx` — Add "Assign to Agent" button
- `mcp-server/src/agent_task_planner/tools.py` — Optional: add `github_review_pr` tool

**Estimated complexity:** Medium

---

## Phase 4: Task ↔ Issue Bidirectional Sync

### 4.1 Task Completion → Close GitHub Issue

When a task with a linked GitHub issue is marked as completed, automatically close the issue.

**Modify `task_complete` in `mcp-server/src/agent_task_planner/tools.py`:**

```python
@mcp.tool()
def task_complete(task_id: str, agent_id: str, result: Optional[str] = None) -> dict:
    # ... existing completion logic ...

    # After marking task complete, check for linked GitHub issue
    context = task.get("context", {})
    github_info = context.get("github", {})
    linked_issue = github_info.get("linked_issue")
    repo_url = github_info.get("repo_url")

    if linked_issue and repo_url:
        try:
            close_github_issue(
                repo_url=repo_url,
                issue_number=linked_issue,
                comment=f"Closed automatically — task completed.\n\nResult: {result or 'No details provided.'}"
            )
        except Exception as e:
            # Log but don't fail the task completion
            add_task_log(task_id, agent_id,
                f"Warning: Failed to close GitHub issue #{linked_issue}: {e}")

    return {"success": True, ...}
```

**Helper function** (in `tools.py` or new `github_utils.py`):

```python
def close_github_issue(repo_url: str, issue_number: int, comment: str):
    """Close a GitHub issue using gh CLI."""
    owner, repo = parse_repo_url(repo_url)

    # Add closing comment
    subprocess.run(
        ["gh", "issue", "comment", str(issue_number),
         "--repo", f"{owner}/{repo}", "--body", comment],
        capture_output=True, text=True, check=True
    )

    # Close the issue
    subprocess.run(
        ["gh", "issue", "close", str(issue_number),
         "--repo", f"{owner}/{repo}"],
        capture_output=True, text=True, check=True
    )
```

**Gating:** Only trigger if the project has `sync_issues: true` in its GitHub settings. This respects the existing settings field that's already stored but unused.

### 4.2 GitHub Issue Closed → Update Task

When a GitHub issue is closed externally, update the linked task.

**Approach:** Polling (piggyback on the notification poll from Phase 5).

**New backend endpoint** in `github.py`:

```python
POST /api/github/{project_id}/sync
  → Checks all tasks with linked GitHub issues
  → For each linked issue, checks current state via gh CLI
  → If issue is closed but task is not done, updates task status
  → Returns list of synced changes
```

```python
@router.post("/{project_id}/sync")
async def sync_github_state(project_id: str):
    """Check linked GitHub issues and sync status."""
    db = get_db()

    # Find tasks with linked issues that aren't done
    tasks = db.execute("""
        SELECT id, title, status, context
        FROM tasks
        WHERE project_id = ? AND status NOT IN ('done', 'failed')
        AND json_extract(context, '$.github.linked_issue') IS NOT NULL
    """).fetchall()

    synced = []
    for task in tasks:
        issue_number = task.context['github']['linked_issue']
        repo_url = task.context['github']['repo_url']
        issue_state = get_issue_state(repo_url, issue_number)

        if issue_state == 'closed' and task.status != 'done':
            update_task_status(task.id, 'done',
                result=f"Auto-completed: linked GitHub issue #{issue_number} was closed.")
            synced.append({
                "task_id": task.id,
                "task_title": task.title,
                "issue_number": issue_number,
                "action": "completed"
            })

    return {"synced": synced, "count": len(synced)}
```

**Frontend:** Call this endpoint on the same 60-second interval as PR notifications. When a task gets auto-completed, show a toast:

> "Task 'Fix login bug' was completed — linked GitHub issue #42 was closed."

**Files to create/modify:**
- `mcp-server/src/agent_task_planner/tools.py` — Modify `task_complete` to close linked issues
- `orchestrator/src/orchestrator/api/github.py` — Add sync endpoint
- `web/src/hooks/useGitHubSync.ts` — New hook for polling sync

**Estimated complexity:** Small-Medium

---

## Phase 5: New PR Notifications

Alert the user when new PRs appear on their repos.

### Approach: Polling

- Poll `GET /api/github/{project_id}/pulls?state=open` every 60 seconds
- Track previously seen PR numbers in localStorage per project
- When a new PR number appears, show a notification badge on the GitHub tab
- Badge clears when user opens the GitHub tab

### Implementation

**New hook:** `web/src/hooks/useGitHubNotifications.ts`

```typescript
const useGitHubNotifications = (projectId: string | null) => {
  const [newPRCount, setNewPRCount] = useState(0)
  const [lastSeenPRs, setLastSeenPRs] = useLocalStorage<number[]>('seen-prs', [])

  useEffect(() => {
    if (!projectId) return
    const interval = setInterval(async () => {
      const response = await orchestrator.listPullRequests(projectId, 'open')
      const newOnes = response.pull_requests.filter(
        pr => !lastSeenPRs.includes(pr.number)
      )
      setNewPRCount(newOnes.length)
    }, 60_000)
    return () => clearInterval(interval)
  }, [projectId, lastSeenPRs])

  const markAllSeen = () => { /* update lastSeenPRs */ }

  return { newPRCount, markAllSeen }
}
```

### UI Integration

**Tab badge in `App.tsx`:**

```tsx
{tabs.map((tab) => (
  <button key={tab.id} onClick={() => {
    setActiveTab(tab.id)
    if (tab.id === 'github') markAllSeen()
  }}>
    {tab.label}
    {tab.id === 'github' && newPRCount > 0 && (
      <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-geoff-error text-white rounded-full">
        {newPRCount}
      </span>
    )}
  </button>
))}
```

- Red badge on the GitHub tab showing unseen PR count
- "New" indicator on individual PR cards that haven't been viewed
- Badge clears when user opens the GitHub tab

### Future Enhancement: Webhooks

For real-time notifications without polling, a webhook endpoint could be added later:

```
POST /api/github/webhooks
  → Receives GitHub webhook events (pull_request opened, closed, etc.)
  → Pushes notification via WebSocket to frontend
```

This is optional and more complex (requires a publicly accessible URL or tunnel). Polling is sufficient for a single-user app.

**Files to create/modify:**
- `web/src/hooks/useGitHubNotifications.ts` — New hook
- `web/src/App.tsx` — Add badge to tab navigation, call `markAllSeen` on tab switch

**Estimated complexity:** Small

---

## Implementation Phases — Summary

| Phase | Feature | What It Does | Complexity |
|-------|---------|-------------|------------|
| **0** | GitHub Tab | Dedicated tab composing existing components into a dashboard | Trivial |
| **1** | PR Detail View | Click a PR → see description, diff, changed files, comments | Medium |
| **2** | PR Review Actions | Approve, reject, comment, close, or merge PRs from the app | Small-Medium |
| **3** | Assign to Agent | Create a task from a PR and launch an agent to review/fix it | Medium |
| **4** | Task ↔ Issue Sync | Task done → issue closes. Issue closed → task completes. | Small-Medium |
| **5** | PR Notifications | Badge on GitHub tab when new PRs arrive, clears when viewed | Small |

### Dependency Order

```
Phase 0 (GitHub Tab)
  └── Phase 1 (PR Detail View)
        └── Phase 2 (PR Review Actions)
        └── Phase 3 (Assign to Agent)
  └── Phase 5 (PR Notifications)

Phase 4 (Task ↔ Issue Sync) — Independent, can be done in parallel
```

Phase 0 ships first to give all subsequent phases a home. Phases 1→2→3 build on each other. Phase 4 and 5 are independent and can be done at any point after Phase 0.

### What Stays Where

| Component | Location | Reason |
|-----------|----------|--------|
| GitStatusBar | File Browser + GitHub Tab | Contextual in files, overview in GitHub tab |
| GitHubContext | TaskDetail | Shows linked PR/issue for a specific task |
| GitHubSettings | Settings tab | Configuration belongs in settings |
| PullRequestList | GitHub Tab | Primary home for PR management |
| IssueList | GitHub Tab | Primary home for issue management |
| CommitHistory | GitHub Tab | Commit timeline view |
| BranchSelector | GitStatusBar (embedded) | Branch switching is contextual to status |
| PRDetailModal | GitHub Tab (overlay) | Opens from PullRequestList |
| AgentPanel | GitHub Tab + other tabs | Shows active agents regardless of context |

All phases build on the existing architecture and follow established patterns. No new dependencies required — everything uses the `gh` CLI that's already integrated.
