import { Task, TaskStatus } from '../../lib/supabase'
import { useTasks, groupTasksByStatus } from '../../hooks/useTasks'

const statusConfig: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  queued: { label: 'Queued', color: 'text-geoff-text-muted', bg: 'bg-geoff-card' },
  ready: { label: 'Ready', color: 'text-geoff-accent', bg: 'bg-geoff-accent-dim' },
  assigned: { label: 'Assigned', color: 'text-geoff-purple', bg: 'bg-geoff-purple-dim' },
  in_progress: { label: 'In Progress', color: 'text-geoff-warning', bg: 'bg-geoff-warning-dim' },
  done: { label: 'Done', color: 'text-geoff-success', bg: 'bg-geoff-success-dim' },
  failed: { label: 'Failed', color: 'text-geoff-error', bg: 'bg-geoff-error-dim' },
  blocked: { label: 'Blocked', color: 'text-orange-400', bg: 'bg-orange-500/10' },
}

const priorityBorders = [
  'border-l-geoff-text-dim',
  'border-l-geoff-accent',
  'border-l-geoff-warning',
  'border-l-orange-500',
  'border-l-geoff-error',
]

const statusOrder: TaskStatus[] = ['in_progress', 'assigned', 'ready', 'queued', 'blocked', 'done', 'failed']

interface TaskItemProps {
  task: Task
  onSelect: () => void
  isSelected: boolean
}

function TaskItem({ task, onSelect, isSelected }: TaskItemProps) {
  const config = statusConfig[task.status]
  const borderColor = priorityBorders[task.priority] || priorityBorders[0]

  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-lg cursor-pointer border-l-4 ${borderColor} transition-all ${
        isSelected
          ? 'bg-geoff-accent-dim border border-geoff-accent'
          : 'bg-geoff-surface border border-geoff-border hover:border-geoff-border-light'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-geoff-text flex-1">{task.title}</h3>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.color}`}>
          {config.label}
        </span>
      </div>

      {task.description && (
        <p className="text-sm text-geoff-text-muted mt-1 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-3 mt-2 text-xs text-geoff-text-dim">
        {task.projects && (
          <span className="px-1.5 py-0.5 bg-geoff-card rounded border border-geoff-border">
            {task.projects.name}
          </span>
        )}
        {task.priority > 0 && (
          <span>P{task.priority}</span>
        )}
        {task.assigned_agent && (
          <span className="font-mono">Agent: {task.assigned_agent.slice(0, 8)}</span>
        )}
        {task.progress > 0 && task.status === 'in_progress' && (
          <span>{task.progress}%</span>
        )}
      </div>

      {task.progress > 0 && task.status === 'in_progress' && (
        <div className="mt-2 h-1 bg-geoff-border rounded-full overflow-hidden">
          <div
            className="h-full bg-geoff-accent transition-all"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

interface TaskColumnProps {
  status: TaskStatus
  tasks: Task[]
  selectedTaskId: string | null
  onSelectTask: (id: string) => void
}

function TaskColumn({ status, tasks, selectedTaskId, onSelectTask }: TaskColumnProps) {
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
            onSelect={() => onSelectTask(task.id)}
            isSelected={selectedTaskId === task.id}
          />
        ))}
      </div>
    </div>
  )
}

export function TaskList() {
  const { tasks, loading, error, selectedTaskId, selectTask } = useTasks()
  const groupedTasks = groupTasksByStatus(tasks)

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
          selectedTaskId={selectedTaskId}
          onSelectTask={selectTask}
        />
      ))}
    </div>
  )
}
