import { useState } from 'react'
import { Task, TaskStatus } from '../../lib/supabase'
import { useTasks, groupTasksByStatus } from '../../hooks/useTasks'
import { useAgents } from '../../hooks/useAgents'
import { TaskItem } from './TaskItem'

const statusConfig: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  queued: { label: 'Queued', color: 'text-geoff-text-muted', bg: 'bg-geoff-card' },
  ready: { label: 'Ready', color: 'text-geoff-accent', bg: 'bg-geoff-accent-dim' },
  assigned: { label: 'Assigned', color: 'text-geoff-purple', bg: 'bg-geoff-purple-dim' },
  in_progress: { label: 'In Progress', color: 'text-geoff-warning', bg: 'bg-geoff-warning-dim' },
  done: { label: 'Done', color: 'text-geoff-success', bg: 'bg-geoff-success-dim' },
  failed: { label: 'Failed', color: 'text-geoff-error', bg: 'bg-geoff-error-dim' },
  blocked: { label: 'Blocked', color: 'text-orange-400', bg: 'bg-orange-500/10' },
}

const activeStatuses: TaskStatus[] = ['in_progress', 'assigned', 'ready', 'queued', 'blocked']
const completedStatuses: TaskStatus[] = ['done', 'failed']

interface TaskColumnProps {
  status: TaskStatus
  tasks: Task[]
  onLaunchTask: (task: Task) => void
  launchingTaskId: string | null
}

function TaskColumn({ status, tasks, onLaunchTask, launchingTaskId }: TaskColumnProps) {
  const config = statusConfig[status]

  if (tasks.length === 0) return null

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className={`font-semibold ${config.color}`}>{config.label}</h2>
        <span className={`px-2 py-0.5 rounded-full text-xs ${config.bg} ${config.color}`}>
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onLaunchTask={onLaunchTask}
            isLaunching={launchingTaskId === task.id}
          />
        ))}
      </div>
    </div>
  )
}

function useTaskLauncher() {
  const { projectFilter, optimisticUpdateTask } = useTasks()
  const { launchAgent, selectAgent } = useAgents()
  const [launchingTaskId, setLaunchingTaskId] = useState<string | null>(null)

  const handleLaunchTask = async (task: Task) => {
    if (launchingTaskId) return
    setLaunchingTaskId(task.id)

    // Optimistically update task status immediately for instant UI feedback
    optimisticUpdateTask(task.id, {
      status: 'assigned',
      assigned_agent: 'launching...'
    })

    try {
      const projectPath = task.projects?.path
      const projectId = task.project_id || projectFilter || undefined

      const prompt = `You have access to the agent-task-planner MCP server. Use it to:
1. Call task_claim with task_id "${task.id}" and your agent ID to claim this specific task.
2. Read the task title, description, and any attachments to understand what needs to be done.
3. Complete the work described in the task.
4. Call task_complete when done, or task_fail if you encounter an issue.

The task you need to work on:
- Title: ${task.title}
${task.description ? `- Description: ${task.description}` : ''}

Be thorough and follow the task requirements.`

      const agent = await launchAgent(prompt, projectPath || undefined, projectId, undefined, task.title)
      if (agent) {
        // Update with actual agent ID once launched
        optimisticUpdateTask(task.id, { assigned_agent: agent.id })
        selectAgent(agent.id)
      }
    } catch {
      // On error, revert the task back to ready status
      optimisticUpdateTask(task.id, {
        status: 'ready',
        assigned_agent: null
      })
    } finally {
      setLaunchingTaskId(null)
    }
  }

  return { handleLaunchTask, launchingTaskId }
}

export function ActiveTaskList() {
  const { tasks, loading, error } = useTasks()
  const { handleLaunchTask, launchingTaskId } = useTaskLauncher()
  const groupedTasks = groupTasksByStatus(tasks)

  const activeTasks = activeStatuses.flatMap(status => groupedTasks[status])
  const hasActiveTasks = activeTasks.length > 0

  if (loading && tasks.length === 0) {
    return (
      <div className="card p-8 text-center text-geoff-text-muted">
        Loading tasks...
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-4 bg-geoff-error-dim border-geoff-error text-geoff-error">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-geoff-text">Active Tasks</h2>
        <span className="px-2 py-0.5 rounded-full text-xs bg-geoff-accent-dim text-geoff-accent">
          {activeTasks.length}
        </span>
      </div>

      {!hasActiveTasks ? (
        <div className="text-center text-geoff-text-muted py-4">
          <p>No active tasks</p>
          <p className="text-sm mt-1">Add a task using the form above</p>
        </div>
      ) : (
        activeStatuses.map((status) => (
          <TaskColumn
            key={status}
            status={status}
            tasks={groupedTasks[status]}
            onLaunchTask={handleLaunchTask}
            launchingTaskId={launchingTaskId}
          />
        ))
      )}
    </div>
  )
}

const COMPLETED_TASKS_LIMIT = 10

export function CompletedTaskList() {
  const { tasks, loading, error } = useTasks()
  const { handleLaunchTask, launchingTaskId } = useTaskLauncher()
  const groupedTasks = groupTasksByStatus(tasks)
  const [expanded, setExpanded] = useState(false)

  // Get all completed tasks and sort by completed_at (most recent first)
  const allCompletedTasks = completedStatuses
    .flatMap(status => groupedTasks[status])
    .sort((a, b) => {
      const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0
      const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0
      return dateB - dateA // Most recent first
    })

  const hasCompletedTasks = allCompletedTasks.length > 0
  const hasMoreTasks = allCompletedTasks.length > COMPLETED_TASKS_LIMIT
  const displayedTasks = expanded ? allCompletedTasks : allCompletedTasks.slice(0, COMPLETED_TASKS_LIMIT)

  // Group displayed tasks by status for rendering
  const displayedGrouped = completedStatuses.reduce((acc, status) => {
    acc[status] = displayedTasks.filter(task => task.status === status)
    return acc
  }, {} as Record<TaskStatus, Task[]>)

  if (loading && tasks.length === 0) {
    return null // Don't show loading state for completed tasks if we're still loading
  }

  if (error) {
    return null // Error is already shown in ActiveTaskList
  }

  if (!hasCompletedTasks) {
    return null // Don't show empty completed section
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-geoff-text">Completed Tasks</h2>
        <span className="px-2 py-0.5 rounded-full text-xs bg-geoff-success-dim text-geoff-success">
          {allCompletedTasks.length}
        </span>
      </div>

      {completedStatuses.map((status) => (
        <TaskColumn
          key={status}
          status={status}
          tasks={displayedGrouped[status]}
          onLaunchTask={handleLaunchTask}
          launchingTaskId={launchingTaskId}
        />
      ))}

      {hasMoreTasks && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-4 py-2 px-4 text-sm font-medium text-geoff-accent hover:text-geoff-accent-light bg-geoff-accent-dim hover:bg-geoff-accent/20 rounded-lg transition-all"
        >
          {expanded ? 'Show less' : `See more (${allCompletedTasks.length - COMPLETED_TASKS_LIMIT} more)`}
        </button>
      )}
    </div>
  )
}

// Keep the original TaskList for backwards compatibility
export function TaskList() {
  const { tasks, loading, error } = useTasks()
  const { handleLaunchTask, launchingTaskId } = useTaskLauncher()
  const groupedTasks = groupTasksByStatus(tasks)

  const statusOrder: TaskStatus[] = ['in_progress', 'assigned', 'ready', 'queued', 'blocked', 'done', 'failed']

  if (loading && tasks.length === 0) {
    return (
      <div className="card p-8 text-center text-geoff-text-muted">
        Loading tasks...
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-4 bg-geoff-error-dim border-geoff-error text-geoff-error">
        Error: {error}
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="card p-8 text-center text-geoff-text-muted">
        <p>No tasks yet</p>
        <p className="text-sm mt-1">Add a task using the form above</p>
      </div>
    )
  }

  return (
    <div className="card p-4">
      {statusOrder.map((status) => (
        <TaskColumn
          key={status}
          status={status}
          tasks={groupedTasks[status]}
          onLaunchTask={handleLaunchTask}
          launchingTaskId={launchingTaskId}
        />
      ))}
    </div>
  )
}
