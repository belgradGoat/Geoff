import { useState, useEffect } from 'react'
import { useTasks } from '../../hooks/useTasks'
import { Task, TaskStatus, TaskComplexity, TaskAttachment } from '../../lib/supabase'

const statusOptions: TaskStatus[] = ['queued', 'ready', 'assigned', 'in_progress', 'done', 'failed', 'blocked']
const complexityOptions: TaskComplexity[] = ['trivial', 'small', 'medium', 'large', 'unknown']

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

export function TaskDetail() {
  const { tasks, selectedTaskId, selectTask, updateTask, deleteTask } = useTasks()
  const task = tasks.find((t) => t.id === selectedTaskId)

  const [isEditing, setIsEditing] = useState(false)
  const [editedTask, setEditedTask] = useState<Partial<Task>>({})

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

  if (!task) {
    return (
      <div className="card p-6 text-center text-geoff-text-muted">
        Select a task to view details
      </div>
    )
  }

  const handleSave = async () => {
    await updateTask(task.id, editedTask)
    setIsEditing(false)
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this task?')) {
      await deleteTask(task.id)
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <button
          onClick={() => selectTask(null)}
          className="text-geoff-text-dim hover:text-geoff-text transition-colors"
        >
          &times; Close
        </button>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
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
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
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
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-4">
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
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-geoff-text">{task.title}</h2>

          {task.description && (
            <p className="text-geoff-text-muted whitespace-pre-wrap">{task.description}</p>
          )}

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

          <div className="text-xs text-geoff-text-dim pt-4 border-t border-geoff-border">
            <div>Created: {new Date(task.created_at).toLocaleString()}</div>
            <div>Updated: {new Date(task.updated_at).toLocaleString()}</div>
            {task.started_at && <div>Started: {new Date(task.started_at).toLocaleString()}</div>}
            {task.completed_at && <div>Completed: {new Date(task.completed_at).toLocaleString()}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
