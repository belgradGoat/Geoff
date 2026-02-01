import { Task, TaskStatus } from '../../lib/supabase'
import { useTasks, groupTasksByStatus } from '../../hooks/useTasks'

const statusConfig: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  queued: { label: 'Queued', color: 'text-gray-600', bg: 'bg-gray-100' },
  ready: { label: 'Ready', color: 'text-blue-600', bg: 'bg-blue-100' },
  assigned: { label: 'Assigned', color: 'text-purple-600', bg: 'bg-purple-100' },
  in_progress: { label: 'In Progress', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  done: { label: 'Done', color: 'text-green-600', bg: 'bg-green-100' },
  failed: { label: 'Failed', color: 'text-red-600', bg: 'bg-red-100' },
  blocked: { label: 'Blocked', color: 'text-orange-600', bg: 'bg-orange-100' },
}

const statusOrder: TaskStatus[] = ['in_progress', 'assigned', 'ready', 'queued', 'blocked', 'done', 'failed']

interface TaskItemProps {
  task: Task
  onSelect: () => void
  isSelected: boolean
}

function TaskItem({ task, onSelect, isSelected }: TaskItemProps) {
  const config = statusConfig[task.status]

  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-lg cursor-pointer border transition-colors ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-gray-900 flex-1">{task.title}</h3>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.color}`}>
          {config.label}
        </span>
      </div>

      {task.description && (
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        {task.projects && (
          <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
            {task.projects.name}
          </span>
        )}
        {task.priority > 0 && (
          <span className="flex items-center gap-1">
            P{task.priority}
          </span>
        )}
        {task.assigned_agent && (
          <span className="flex items-center gap-1">
            Agent: {task.assigned_agent.slice(0, 8)}
          </span>
        )}
        {task.progress > 0 && task.status === 'in_progress' && (
          <span className="flex items-center gap-1">
            {task.progress}%
          </span>
        )}
      </div>

      {task.progress > 0 && task.status === 'in_progress' && (
        <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
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
      <div className="flex items-center justify-center h-48 text-gray-500">
        Loading tasks...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
        Error: {error}
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-500">
        <p>No tasks yet</p>
        <p className="text-sm">Add a task using the form above</p>
      </div>
    )
  }

  return (
    <div>
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
