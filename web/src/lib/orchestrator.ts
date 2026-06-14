const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL || `${window.location.protocol}//${window.location.hostname}:8080`
const apiKey = import.meta.env.VITE_ORCHESTRATOR_API_KEY || ''

export interface Project {
  id: string
  name: string
  path: string
  description: string | null
  is_active: boolean
}

export interface ProjectListResponse {
  projects: Project[]
  count: number
}

export interface ScannedProject {
  name: string
  path: string
  markers: string[]
  exists_in_db: boolean
  db_id: string | null
}

export interface ScanResponse {
  base_path: string
  projects: ScannedProject[]
  count: number
}

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  is_file: boolean
  size?: number
  modified?: string
  extension?: string
}

export interface BrowseResponse {
  current_path: string
  parent_path: string | null
  entries: FileEntry[]
  total_files: number
  total_dirs: number
}

export interface QuickPathsResponse {
  paths: FileEntry[]
}

export interface FileContentResponse {
  path: string
  name: string
  size: number
  modified: string
  content: string
  is_truncated: boolean
  mime_type: string | null
}

export interface SystemInfoResponse {
  hostname: string
  platform: string
  home_dir: string
  tailscale_ip: string | null
  orchestrator_url: string
}

export interface CreateDirectoryResponse {
  path: string
  name: string
  created: boolean
}

export interface AllowedPathsResponse {
  paths: string[]
  restricted: boolean
}

// GitHub-related interfaces
export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  modified: string[]
  untracked: string[]
  staged: string[]
  is_git_repo: boolean
  remote_url: string | null
  has_remote: boolean
}

export interface GitBranch {
  name: string
  is_current: boolean
  last_commit: string | null
  last_commit_date: string | null
}

export interface BranchListResponse {
  branches: GitBranch[]
  current_branch: string
  count: number
}

export interface GitCommit {
  sha: string
  short_sha: string
  message: string
  author: string
  date: string
}

export interface CommitListResponse {
  commits: GitCommit[]
  count: number
}

export interface PullRequest {
  number: number
  title: string
  state: string
  author: string
  created_at: string
  url: string
  head_branch: string
  base_branch: string
}

export interface PullRequestListResponse {
  pull_requests: PullRequest[]
  count: number
}

export interface CreatePullRequestRequest {
  title: string
  body?: string
  head_branch?: string
  base_branch?: string
}

export interface GitHubIssue {
  number: number
  title: string
  state: string
  labels: string[]
  assignees: string[]
  created_at: string
  url: string
}

export interface IssueListResponse {
  issues: GitHubIssue[]
  count: number
}

export interface CreateIssueRequest {
  title: string
  body?: string
  labels?: string[]
}

export interface TokenValidationResponse {
  valid: boolean
  username: string | null
  scopes: string[]
  error: string | null
}

export interface GitHubSettings {
  token_configured: boolean
  repo_url: string | null
  owner: string | null
  repo: string | null
  default_branch: string
  auto_create_pr: boolean
  sync_issues: boolean
}

export interface GitHubSettingsUpdate {
  token?: string
  repo_url?: string
  default_branch?: string
  auto_create_pr?: boolean
  sync_issues?: boolean
}

// PR Detail interfaces
export interface PRReview {
  id: number
  author: string
  state: string
  body: string
  submitted_at: string
}

export interface PRComment {
  id: number
  author: string
  body: string
  created_at: string
  path?: string
  line?: number
}

export interface PullRequestDetail extends PullRequest {
  body: string
  additions: number
  deletions: number
  changed_files: number
  mergeable: boolean
  review_status: string
  labels: string[]
  reviews: PRReview[]
  comments: PRComment[]
}

export interface PRChangedFile {
  filename: string
  status: string
  additions: number
  deletions: number
  patch: string
}

export interface PRFilesResponse {
  files: PRChangedFile[]
  count: number
}

export interface SyncResult {
  task_id: string
  task_title: string
  issue_number: number
  action: string
}

export interface SyncResponse {
  synced: SyncResult[]
  count: number
  message?: string
}

// Chain orchestration interfaces
export interface ChainExecutionResponse {
  id: string
  template_id: string | null
  chain_type: string
  task_id: string
  project_id: string | null
  status: string
  config: Record<string, unknown>
  context: Record<string, unknown>
  current_stage_index: number
  total_stages: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface ChainStageResponse {
  id: string
  chain_execution_id: string
  stage_index: number
  stage_name: string
  stage_type: string
  status: string
  agent_id: string | null
  result: string | null
  result_data: Record<string, unknown>
  error_message: string | null
  retry_count: number
  max_retries: number
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface Agent {
  id: string
  prompt: string
  working_dir: string
  provider: string
  status: 'starting' | 'running' | 'stopped' | 'failed'
  pid: number | null
  started_at: string
  stopped_at: string | null
  exit_code: number | null
  error: string | null
  output_lines: number
  task_title: string | null
}

export interface ProviderInfo {
  id: string
  name: string
  description: string
  has_free_tier: boolean
  mcp_support: boolean
  website: string
}

export interface ProvidersResponse {
  providers: ProviderInfo[]
  default: string
}

export interface AgentListResponse {
  agents: Agent[]
  count: number
}

export interface AgentOutputResponse {
  lines: string[]
  total: number
  offset: number
}

async function fetchWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${orchestratorUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response
}

export const orchestrator = {
  async listProviders(): Promise<ProvidersResponse> {
    const response = await fetchWithAuth('/api/agents/providers')
    return response.json()
  },

  async launchAgent(prompt: string, workingDir?: string, projectId?: string, provider?: string, taskTitle?: string): Promise<Agent> {
    const response = await fetchWithAuth('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        working_dir: workingDir,
        project_id: projectId,
        provider,
        task_title: taskTitle,
      }),
    })
    return response.json()
  },

  async listAgents(): Promise<AgentListResponse> {
    const response = await fetchWithAuth('/api/agents')
    return response.json()
  },

  async getAgent(agentId: string): Promise<Agent> {
    const response = await fetchWithAuth(`/api/agents/${agentId}`)
    return response.json()
  },

  async stopAgent(agentId: string): Promise<Agent> {
    const response = await fetchWithAuth(`/api/agents/${agentId}`, {
      method: 'DELETE',
    })
    return response.json()
  },

  async getAgentOutput(agentId: string, offset = 0, limit = 100): Promise<AgentOutputResponse> {
    const response = await fetchWithAuth(`/api/agents/${agentId}/output?offset=${offset}&limit=${limit}`)
    return response.json()
  },

  streamAgent(agentId: string, onMessage: (data: { type: string; data?: string; status?: string; exit_code?: number }) => void): WebSocket {
    const wsUrl = `${orchestratorUrl.replace('http', 'ws')}/api/agents/${agentId}/stream?api_key=${apiKey}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log(`[WebSocket] Connected to agent ${agentId.slice(0, 8)}`)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage(data)
      } catch {
        console.error('Failed to parse WebSocket message:', event.data)
      }
    }

    ws.onerror = (error) => {
      console.error(`[WebSocket] Error for agent ${agentId.slice(0, 8)}:`, error)
    }

    ws.onclose = (event) => {
      console.log(`[WebSocket] Closed for agent ${agentId.slice(0, 8)}: code=${event.code}, reason=${event.reason || 'none'}`)
    }

    return ws
  },

  // Project management
  async listProjects(): Promise<ProjectListResponse> {
    const response = await fetchWithAuth('/api/projects')
    return response.json()
  },

  async scanDirectory(basePath: string): Promise<ScanResponse> {
    const response = await fetchWithAuth('/api/projects/scan', {
      method: 'POST',
      body: JSON.stringify({ base_path: basePath }),
    })
    return response.json()
  },

  async syncProjects(basePath: string, projectPaths?: string[]): Promise<ProjectListResponse> {
    const response = await fetchWithAuth('/api/projects/sync', {
      method: 'POST',
      body: JSON.stringify({ base_path: basePath, project_paths: projectPaths }),
    })
    return response.json()
  },

  async createProject(name: string, path: string, description?: string): Promise<Project> {
    const response = await fetchWithAuth('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, path, description }),
    })
    return response.json()
  },

  // Filesystem browsing
  async browseDirectory(path?: string, showHidden = false): Promise<BrowseResponse> {
    const response = await fetchWithAuth('/api/filesystem/browse', {
      method: 'POST',
      body: JSON.stringify({ path, show_hidden: showHidden }),
    })
    return response.json()
  },

  async readFile(path: string, maxLines?: number): Promise<FileContentResponse> {
    const response = await fetchWithAuth('/api/filesystem/read', {
      method: 'POST',
      body: JSON.stringify({ path, max_lines: maxLines }),
    })
    return response.json()
  },

  async getQuickPaths(): Promise<QuickPathsResponse> {
    const response = await fetchWithAuth('/api/filesystem/quick-paths')
    return response.json()
  },

  async getSystemInfo(): Promise<SystemInfoResponse> {
    const response = await fetchWithAuth('/api/filesystem/system-info')
    return response.json()
  },

  async createDirectory(parentPath: string, name: string): Promise<CreateDirectoryResponse> {
    const response = await fetchWithAuth('/api/filesystem/create-directory', {
      method: 'POST',
      body: JSON.stringify({ parent_path: parentPath, name }),
    })
    return response.json()
  },

  // Allowed paths management
  async getAllowedPaths(): Promise<AllowedPathsResponse> {
    const response = await fetchWithAuth('/api/filesystem/allowed-paths')
    return response.json()
  },

  async setAllowedPaths(paths: string[]): Promise<AllowedPathsResponse> {
    const response = await fetchWithAuth('/api/filesystem/allowed-paths', {
      method: 'POST',
      body: JSON.stringify({ paths }),
    })
    return response.json()
  },

  async addAllowedPath(path: string): Promise<AllowedPathsResponse> {
    const response = await fetchWithAuth('/api/filesystem/allowed-paths/add', {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
    return response.json()
  },

  async removeAllowedPath(path: string): Promise<AllowedPathsResponse> {
    const response = await fetchWithAuth('/api/filesystem/allowed-paths/remove', {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
    return response.json()
  },

  // Chat session management
  async startChatSession(workingDirectory?: string): Promise<{ id: string }> {
    const response = await fetchWithAuth('/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ working_directory: workingDirectory }),
    })
    return response.json()
  },

  async endChatSession(sessionId: string): Promise<void> {
    await fetchWithAuth(`/api/chat/sessions/${sessionId}`, {
      method: 'DELETE',
    })
  },

  async getChatSessionStatus(sessionId: string): Promise<{ id: string; status: string; connected: boolean; message_count: number; last_activity: string } | null> {
    try {
      const response = await fetchWithAuth(`/api/chat/sessions/${sessionId}/status`)
      return response.json()
    } catch {
      // Session not found or stopped - return null to indicate no reconnection possible
      return null
    }
  },

  connectChatWebSocket(
    sessionId: string,
    handlers: {
      onMessage: (data: { type: string; data?: string; message?: string; buffer_len?: number }) => void
      onClose: () => void
      onError?: (error: Event) => void
    },
    since = 0
  ): WebSocket {
    // `since` = number of output lines already rendered; the server replays only
    // what was missed while disconnected (catch-up on reconnect).
    const wsUrl = `${orchestratorUrl.replace('http', 'ws')}/api/chat/sessions/${sessionId}/ws?api_key=${apiKey}&since=${since}`
    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handlers.onMessage(data)
      } catch {
        console.error('Failed to parse WebSocket message:', event.data)
      }
    }

    ws.onclose = handlers.onClose

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      handlers.onError?.(error)
    }

    return ws
  },

  // GitHub integration
  async getGitStatus(projectId: string): Promise<GitStatus> {
    const response = await fetchWithAuth(`/api/github/${projectId}/status`)
    return response.json()
  },

  async listBranches(projectId: string): Promise<BranchListResponse> {
    const response = await fetchWithAuth(`/api/github/${projectId}/branches`)
    return response.json()
  },

  async createBranch(projectId: string, branchName: string, fromBranch?: string): Promise<{ success: boolean; branch: string; message: string }> {
    const params = new URLSearchParams({ branch_name: branchName })
    if (fromBranch) params.append('from_branch', fromBranch)
    const response = await fetchWithAuth(`/api/github/${projectId}/branches?${params}`, {
      method: 'POST',
    })
    return response.json()
  },

  async checkoutBranch(projectId: string, branchName: string): Promise<{ success: boolean; branch: string; message: string }> {
    const response = await fetchWithAuth(`/api/github/${projectId}/branches/checkout?branch_name=${encodeURIComponent(branchName)}`, {
      method: 'POST',
    })
    return response.json()
  },

  async listCommits(projectId: string, limit = 20, branch?: string): Promise<CommitListResponse> {
    const params = new URLSearchParams({ limit: limit.toString() })
    if (branch) params.append('branch', branch)
    const response = await fetchWithAuth(`/api/github/${projectId}/commits?${params}`)
    return response.json()
  },

  async listPullRequests(projectId: string, state = 'open', limit = 20): Promise<PullRequestListResponse> {
    const response = await fetchWithAuth(`/api/github/${projectId}/pulls?state=${state}&limit=${limit}`)
    return response.json()
  },

  async createPullRequest(projectId: string, data: CreatePullRequestRequest): Promise<PullRequest> {
    const response = await fetchWithAuth(`/api/github/${projectId}/pulls`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return response.json()
  },

  async listIssues(projectId: string, state = 'open', limit = 20): Promise<IssueListResponse> {
    const response = await fetchWithAuth(`/api/github/${projectId}/issues?state=${state}&limit=${limit}`)
    return response.json()
  },

  async createIssue(projectId: string, data: CreateIssueRequest): Promise<GitHubIssue> {
    const response = await fetchWithAuth(`/api/github/${projectId}/issues`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return response.json()
  },

  async validateGitHubToken(token: string): Promise<TokenValidationResponse> {
    const response = await fetchWithAuth('/api/github/validate-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
    return response.json()
  },

  async getGitHubSettings(projectId: string): Promise<GitHubSettings> {
    const response = await fetchWithAuth(`/api/github/${projectId}/settings`)
    return response.json()
  },

  async updateGitHubSettings(projectId: string, settings: GitHubSettingsUpdate): Promise<GitHubSettings> {
    const response = await fetchWithAuth(`/api/github/${projectId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
    return response.json()
  },

  async push(projectId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithAuth(`/api/github/${projectId}/push`, {
      method: 'POST',
    })
    return response.json()
  },

  async pull(projectId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithAuth(`/api/github/${projectId}/pull`, {
      method: 'POST',
    })
    return response.json()
  },

  // PR Detail & Review (Phase 1-2)
  async getPullRequestDetail(projectId: string, prNumber: number): Promise<PullRequestDetail> {
    const response = await fetchWithAuth(`/api/github/${projectId}/pulls/${prNumber}`)
    return response.json()
  },

  async getPullRequestFiles(projectId: string, prNumber: number): Promise<PRFilesResponse> {
    const response = await fetchWithAuth(`/api/github/${projectId}/pulls/${prNumber}/files`)
    return response.json()
  },

  async addPRComment(projectId: string, prNumber: number, body: string): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithAuth(`/api/github/${projectId}/pulls/${prNumber}/comment`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    })
    return response.json()
  },

  async submitPRReview(projectId: string, prNumber: number, event: string, body?: string): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithAuth(`/api/github/${projectId}/pulls/${prNumber}/review`, {
      method: 'POST',
      body: JSON.stringify({ event, body }),
    })
    return response.json()
  },

  async closePR(projectId: string, prNumber: number): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithAuth(`/api/github/${projectId}/pulls/${prNumber}/close`, {
      method: 'POST',
    })
    return response.json()
  },

  async mergePR(projectId: string, prNumber: number, method = 'merge'): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithAuth(`/api/github/${projectId}/pulls/${prNumber}/merge`, {
      method: 'POST',
      body: JSON.stringify({ method }),
    })
    return response.json()
  },

  // Chain orchestration
  async getChainTemplates(): Promise<{ templates: { chain_type: string; name: string; stages: { name: string; stage_type: string; description: string }[]; total_stages: number }[] }> {
    const response = await fetchWithAuth('/api/chains/templates')
    return response.json()
  },

  async executeChain(taskId: string, chainType: string, config?: Record<string, unknown>): Promise<{ execution_id: string; chain_type: string; task_id: string; status: string }> {
    const response = await fetchWithAuth('/api/chains/execute', {
      method: 'POST',
      body: JSON.stringify({
        task_id: taskId,
        chain_type: chainType,
        config,
      }),
    })
    return response.json()
  },

  async getChainExecutions(projectId?: string | null, taskId?: string | null): Promise<{ executions: ChainExecutionResponse[]; count: number }> {
    const params = new URLSearchParams()
    if (projectId) params.append('project_id', projectId)
    if (taskId) params.append('task_id', taskId)
    const query = params.toString() ? `?${params}` : ''
    const response = await fetchWithAuth(`/api/chains/executions${query}`)
    return response.json()
  },

  async getChainExecution(executionId: string): Promise<{ execution: ChainExecutionResponse; stages: ChainStageResponse[] }> {
    const response = await fetchWithAuth(`/api/chains/executions/${executionId}`)
    return response.json()
  },

  async stopChain(executionId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithAuth(`/api/chains/executions/${executionId}/stop`, {
      method: 'POST',
    })
    return response.json()
  },

  streamChainExecution(executionId: string, onMessage: (data: Record<string, unknown>) => void): WebSocket {
    const wsUrl = `${orchestratorUrl.replace('http', 'ws')}/api/chains/executions/${executionId}/stream?api_key=${apiKey}`
    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage(data)
      } catch {
        console.error('Failed to parse chain WebSocket message:', event.data)
      }
    }

    return ws
  },

  // GitHub Sync (Phase 4)
  async syncGitHub(projectId: string): Promise<SyncResponse> {
    const response = await fetchWithAuth(`/api/github/${projectId}/sync`, {
      method: 'POST',
    })
    return response.json()
  },
}
