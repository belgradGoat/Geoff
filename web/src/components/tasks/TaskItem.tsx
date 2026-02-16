import { useState, useEffect } from 'react'
import { Task, TaskStatus, TaskComplexity, TaskAttachment } from '../../lib/supabase'
import { useTasks } from '../../hooks/useTasks'
import { useChains, ChainType } from '../../hooks/useChains'
import { ChainProgress } from '../chains/ChainProgress'

const statusConfig: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  queued: { label: 'Queued', color: 'text-geoff-text-muted', bg: 'bg-geoff-card' },
  ready: { label: 'Ready', color: 'text-geoff-accent', bg: 'bg-geoff-accent-dim' },
  assigned: { label: 'Assigned', color: 'text-geoff-purple', bg: 'bg-geoff-purple-dim' },
  in_progress: { label: 'In Progress', color: 'text-geoff-warning', bg: 'bg-geoff-warning-dim' },
  done: { label: 'Done', color: 'text-geoff-success', bg: 'bg-geoff-success-dim' },
  failed: { label: 'Failed', color: 'text-geoff-error', bg: 'bg-geoff-error-dim' },
  blocked: { label: 'Blocked', color: 'text-orange-400', bg: 'bg-orange-500/10' },
}

const statusOptions: TaskStatus[] = ['queued', 'ready', 'assigned', 'in_progress', 'done', 'failed', 'blocked']
const complexityOptions: TaskComplexity[] = ['trivial', 'small', 'medium', 'large', 'unknown']

const priorityBorders = [
  'border-l-geoff-text-dim',
  'border-l-geoff-accent',
  'border-l-geoff-warning',
  'border-l-orange-500',
  'border-l-geoff-error',
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentPreview({ attachment }: { attachment: TaskAttachment }) {
  const [expanded, setExpanded] = useState(false)
  const isImage = attachment.type.startsWith('image/')
  const isText = attachment.type.startsWith('text/') || attachment.type === 'application/json'

  const dataUrl = `data:${attachment.type};base64,${attachment.data}`

  return (
    <div className="border border-geoff-border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-2 bg-geoff-surface cursor-pointer hover:bg-geoff-card transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {isImage ? '🖼️' : attachment.type === 'application/pdf' ? '📄' : '📎'}
          </span>
          <span className="text-sm text-geoff-text truncate max-w-[200px]">{attachment.name}</span>
          <span className="text-xs text-geoff-text-dim">{formatFileSize(attachment.size)}</span>
        </div>
        <svg
          className={`w-4 h-4 text-geoff-text-dim transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {expanded && (
        <div className="p-2 bg-geoff-bg">
          {isImage && (
            <img src={dataUrl} alt={attachment.name} className="max-w-full max-h-64 object-contain mx-auto" />
          )}
          {isText && (
            <pre className="text-xs text-geoff-text font-mono whitespace-pre-wrap max-h-48 overflow-auto p-2 bg-geoff-surface rounded">
              {atob(attachment.data)}
            </pre>
          )}
          {!isImage && !isText && (
            <div className="text-center py-4 text-geoff-text-muted text-sm">
              Preview not available.{' '}
              <a href={dataUrl} download={attachment.name} className="text-geoff-accent hover:underline">
                Download
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export interface TaskItemProps {
  task: Task
  onLaunchTask: (task: Task) => void
  isLaunching: boolean
}

export function TaskItem({ task, onLaunchTask, isLaunching }: TaskItemProps) {
  const { updateTask, deleteTask } = useTasks()
  const { getChainForTask, executeChain, stopChain } = useChains()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedTask, setEditedTask] = useState<Partial<Task>>({})
  const [showChainMenu, setShowChainMenu] = useState(false)
  const [isChainLoading, setIsChainLoading] = useState(false)

  const chainExecution = getChainForTask(task.id)
  const isChainRunning = chainExecution && (chainExecution.status === 'running' || chainExecution.status === 'pending')

  const config = statusConfig[task.status]
  const borderColor = priorityBorders[task.priority] || priorityBorders[0]
  const canLaunch = task.status === 'ready' || task.status === 'queued'

  useEffect(() => {
    if (task) {
      setEditedTask({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        complexity: task.complexity,
      })
    }
  }, [task])

  const handleLaunchClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onLaunchTask(task)
  }

  const handleHeaderClick = () => {
    if (!isEditing) {
      setIsExpanded(!isExpanded)
    }
  }

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await updateTask(task.id, editedTask)
    setIsEditing(false)
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(false)
    setEditedTask({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      complexity: task.complexity,
    })
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this task?')) {
      await deleteTask(task.id)
      setIsExpanded(false)
    }
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
  }

  const handleRunChain = async (chainType: ChainType) => {
    setShowChainMenu(false)
    setIsChainLoading(true)
    try {
      await executeChain(task.id, chainType)
    } finally {
      setIsChainLoading(false)
    }
  }

  const handleStopChain = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (chainExecution) {
      await stopChain(chainExecution.id)
    }
  }

  return (
    <div
      className={`rounded-lg border-l-4 ${borderColor} transition-all ${
        isExpanded
          ? 'bg-geoff-surface border border-geoff-accent'
          : 'bg-geoff-surface border border-geoff-border hover:border-geoff-border-light'
      }`}
    >
      {/* Header - always visible */}
      <div
        onClick={handleHeaderClick}
        className="p-3 cursor-pointer"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <svg
              className={`w-4 h-4 text-geoff-text-dim transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="font-medium text-geoff-text flex-1">{task.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {isChainRunning && (
              <button
                onClick={handleStopChain}
                className="p-1 rounded transition-colors text-geoff-error hover:bg-geoff-error-dim"
                title="Stop chain"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
              </button>
            )}
            {canLaunch && !isChainRunning && (
              <>
                <button
                  onClick={handleLaunchClick}
                  disabled={isLaunching}
                  className={`p-1 rounded transition-colors ${
                    isLaunching
                      ? 'text-geoff-text-dim cursor-not-allowed'
                      : 'text-geoff-accent hover:bg-geoff-accent-dim hover:text-geoff-accent'
                  }`}
                  title="Launch this task"
                >
                  {isLaunching ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowChainMenu(!showChainMenu) }}
                    disabled={isChainLoading}
                    className={`p-1 rounded transition-colors ${
                      isChainLoading
                        ? 'text-geoff-text-dim cursor-not-allowed'
                        : 'text-geoff-purple hover:bg-geoff-purple-dim'
                    }`}
                    title="Run with chain"
                  >
                    {isChainLoading ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </button>
                  {showChainMenu && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-geoff-surface border border-geoff-border rounded-lg shadow-lg py-1 min-w-[160px]">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRunChain('research') }}
                        className="w-full text-left px-3 py-1.5 text-sm text-geoff-text hover:bg-geoff-card transition-colors"
                      >
                        Research Chain
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRunChain('development') }}
                        className="w-full text-left px-3 py-1.5 text-sm text-geoff-text hover:bg-geoff-card transition-colors"
                      >
                        Development Chain
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.color}`}>
              {config.label}
            </span>
          </div>
        </div>

        {!isExpanded && task.description && (
          <p className="text-sm text-geoff-text-muted mt-1 ml-6 line-clamp-2">{task.description}</p>
        )}

        <div className="flex items-center gap-3 mt-2 ml-6 text-xs text-geoff-text-dim">
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

        {task.progress > 0 && task.status === 'in_progress' && !chainExecution && (
          <div className="mt-2 ml-6 h-1 bg-geoff-border rounded-full overflow-hidden">
            <div
              className="h-full bg-geoff-accent transition-all"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}

        {chainExecution && (
          <ChainProgress execution={chainExecution} compact={true} />
        )}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0">
          <div className="border-t border-geoff-border pt-3">
            {isEditing ? (
              <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                <div>
                  <label className="block text-sm font-medium text-geoff-text-muted mb-1">Title</label>
                  <input
                    type="text"
                    value={editedTask.title || ''}
                    onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-geoff-text-muted mb-1">Description</label>
                  <textarea
                    value={editedTask.description || ''}
                    onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
                    rows={4}
                    className="input"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-geoff-text-muted mb-1">Status</label>
                    <select
                      value={editedTask.status}
                      onChange={(e) => setEditedTask({ ...editedTask, status: e.target.value as TaskStatus })}
                      className="input"
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-geoff-text-muted mb-1">Priority</label>
                    <input
                      type="number"
                      value={editedTask.priority || 0}
                      onChange={(e) => setEditedTask({ ...editedTask, priority: Number(e.target.value) })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-geoff-text-muted mb-1">Complexity</label>
                    <select
                      value={editedTask.complexity}
                      onChange={(e) => setEditedTask({ ...editedTask, complexity: e.target.value as TaskComplexity })}
                      className="input"
                    >
                      {complexityOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={handleCancel}
                    className="btn-secondary text-sm py-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="btn-primary text-sm py-1"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Full description */}
                {task.description && (
                  <p className="text-geoff-text-muted whitespace-pre-wrap">{task.description}</p>
                )}

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-geoff-text-dim">Status:</span>
                    <span className="ml-2 font-medium text-geoff-text">{task.status}</span>
                  </div>
                  <div>
                    <span className="text-geoff-text-dim">Priority:</span>
                    <span className="ml-2 font-medium text-geoff-text">{task.priority}</span>
                  </div>
                  <div>
                    <span className="text-geoff-text-dim">Complexity:</span>
                    <span className="ml-2 font-medium text-geoff-text">{task.complexity}</span>
                  </div>
                  <div>
                    <span className="text-geoff-text-dim">Progress:</span>
                    <span className="ml-2 font-medium text-geoff-text">{task.progress}%</span>
                  </div>
                  {task.assigned_agent && (
                    <div className="col-span-2">
                      <span className="text-geoff-text-dim">Assigned Agent:</span>
                      <span className="ml-2 font-medium font-mono text-xs text-geoff-accent">{task.assigned_agent}</span>
                    </div>
                  )}
                  {task.error_message && (
                    <div className="col-span-2">
                      <span className="text-geoff-text-dim">Error:</span>
                      <span className="ml-2 text-geoff-error">{task.error_message}</span>
                    </div>
                  )}
                  {task.result && (
                    <div className="col-span-2">
                      <span className="text-geoff-text-dim">Result:</span>
                      <span className="ml-2 text-geoff-success">{task.result}</span>
                    </div>
                  )}
                </div>

                {/* Attachments */}
                {task.attachments && task.attachments.length > 0 && (
                  <div className="pt-4 border-t border-geoff-border">
                    <h3 className="text-sm font-medium text-geoff-text-muted mb-2">
                      Attachments ({task.attachments.length})
                    </h3>
                    <div className="space-y-2">
                      {task.attachments.map((attachment, index) => (
                        <AttachmentPreview key={index} attachment={attachment} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Timestamps */}
                <div className="text-xs text-geoff-text-dim pt-4 border-t border-geoff-border">
                  <div>Created: {new Date(task.created_at).toLocaleString()}</div>
                  <div>Updated: {new Date(task.updated_at).toLocaleString()}</div>
                  {task.started_at && <div>Started: {new Date(task.started_at).toLocaleString()}</div>}
                  {task.completed_at && <div>Completed: {new Date(task.completed_at).toLocaleString()}</div>}
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={handleEditClick}
                    className="btn-secondary text-sm py-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1 text-sm border border-geoff-error/30 text-geoff-error rounded-lg hover:bg-geoff-error-dim transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
