import { useState } from 'react'
import { orchestrator, PullRequestDetail } from '../../lib/orchestrator'
import { useAgents } from '../../hooks/useAgents'
import { useProjects } from '../../hooks/useProjects'

interface AssignToAgentDialogProps {
  projectId: string
  pr: PullRequestDetail
  onClose: () => void
  onAssigned: () => void
}

type ActionType = 'review' | 'fix' | 'custom'

const PROMPT_TEMPLATES: Record<'review' | 'fix', (pr: PullRequestDetail) => string> = {
  review: (pr) =>
    `Review PR #${pr.number} titled "${pr.title}". The PR merges branch "${pr.head_branch}" into "${pr.base_branch}" with ${pr.additions} additions and ${pr.deletions} deletions across ${pr.changed_files} files.

Read the diff carefully, analyze the code changes, and leave a detailed review with suggestions for improvement. Focus on:
- Code correctness and potential bugs
- Code style and best practices
- Missing error handling
- Performance considerations

Use the gh CLI to leave your review comments on the PR. When done, use task_link_to_pr to link your task to PR #${pr.number}.`,

  fix: (pr) =>
    `Check out branch "${pr.head_branch}" for PR #${pr.number} titled "${pr.title}". The PR merges into "${pr.base_branch}" with ${pr.additions} additions and ${pr.deletions} deletions across ${pr.changed_files} files.

Review the changes, identify any issues (bugs, style problems, missing error handling, performance issues), fix them, commit your fixes, and push to the branch. Use task_link_to_pr to link your task to PR #${pr.number} and task_add_commit for any commits you make.`,
}

export function AssignToAgentDialog({ projectId, pr, onClose, onAssigned }: AssignToAgentDialogProps) {
  const [action, setAction] = useState<ActionType>('review')
  const [customPrompt, setCustomPrompt] = useState('')
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { selectAgent } = useAgents()
  const projects = useProjects.getState().projects
  const project = projects.find(p => p.id === projectId)

  const handleAssign = async () => {
    setLaunching(true)
    setError(null)
    try {
      let prompt: string
      if (action === 'custom') {
        prompt = `Context: PR #${pr.number} "${pr.title}" (${pr.head_branch} → ${pr.base_branch}, ${pr.additions} additions, ${pr.deletions} deletions, ${pr.changed_files} files changed).\n\n${customPrompt}`
      } else {
        prompt = PROMPT_TEMPLATES[action](pr)
      }

      const taskTitle = `PR #${pr.number}: ${action === 'review' ? 'Review' : action === 'fix' ? 'Fix Issues' : 'Custom'} - ${pr.title}`

      // Launch agent with the prompt
      const agent = await orchestrator.launchAgent(
        `You have access to the agent-task-planner MCP server. First, create a task titled "${taskTitle}" using task_create. Then claim it with task_claim. Complete the following work and call task_complete when done, or task_fail if you encounter an issue.\n\n${prompt}`,
        project?.path,
        projectId,
        undefined,
        taskTitle
      )

      selectAgent(agent.id)
      onAssigned()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLaunching(false)
    }
  }

  const actions: { id: ActionType; label: string; description: string }[] = [
    { id: 'review', label: 'Review & Comment', description: 'Agent reads the diff and leaves a code review with suggestions' },
    { id: 'fix', label: 'Fix Issues', description: 'Agent checks out the branch, fixes issues, and pushes commits' },
    { id: 'custom', label: 'Custom Prompt', description: 'Write your own instructions for the agent' },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-geoff-card border border-geoff-border rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-geoff-border">
          <h3 className="font-medium text-geoff-text">Assign to Agent</h3>
          <button onClick={onClose} className="text-geoff-text-muted hover:text-geoff-text">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* PR context */}
          <div className="p-3 bg-geoff-surface rounded-lg border border-geoff-border">
            <div className="text-xs text-geoff-text-muted mb-1">PR #{pr.number}</div>
            <div className="text-sm font-medium text-geoff-text">{pr.title}</div>
            <div className="text-xs text-geoff-text-muted mt-1">
              {pr.head_branch} → {pr.base_branch} · {pr.changed_files} files · +{pr.additions} -{pr.deletions}
            </div>
          </div>

          {/* Action selection */}
          <div className="space-y-2">
            {actions.map(a => (
              <label
                key={a.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  action === a.id
                    ? 'border-geoff-accent bg-geoff-accent/10'
                    : 'border-geoff-border hover:border-geoff-text-muted'
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  value={a.id}
                  checked={action === a.id}
                  onChange={() => setAction(a.id)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-geoff-text">{a.label}</div>
                  <div className="text-xs text-geoff-text-muted">{a.description}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Custom prompt input */}
          {action === 'custom' && (
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="What should the agent do with this PR?"
              rows={4}
              className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text resize-none"
            />
          )}

          {error && (
            <div className="p-2 bg-geoff-error-dim border border-geoff-error/30 rounded text-xs text-geoff-error">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-geoff-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-geoff-text-muted hover:text-geoff-text"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={launching || (action === 'custom' && !customPrompt.trim())}
            className="px-4 py-2 text-sm bg-geoff-accent text-white rounded hover:bg-geoff-accent-hover disabled:opacity-50 transition-colors"
          >
            {launching ? 'Launching...' : 'Launch Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
