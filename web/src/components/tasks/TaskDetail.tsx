import { useState, useEffect } from 'react'
import { useTasks } from '../../hooks/useTasks'
import { Task, TaskStatus, TaskComplexity } from '../../lib/supabase'

const statusOptions: TaskStatus[] = ['queued', 'ready', 'assigned', 'in_progress', 'done', 'failed', 'blocked']
const complexityOptions: TaskComplexity[] = ['trivial', 'small', 'medium', 'large', 'unknown']

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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center text-gray-500">
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <button
          onClick={() => selectTask(null)}
          className="text-gray-400 hover:text-gray-600"
        >
          &times; Close
        </button>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={editedTask.title || ''}
              onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={editedTask.description || ''}
              onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={editedTask.status}
                onChange={(e) => setEditedTask({ ...editedTask, status: e.target.value as TaskStatus })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <input
                type="number"
                value={editedTask.priority || 0}
                onChange={(e) => setEditedTask({ ...editedTask, priority: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Complexity</label>
              <select
                value={editedTask.complexity}
                onChange={(e) => setEditedTask({ ...editedTask, complexity: e.target.value as TaskComplexity })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
          <h2 className="text-xl font-semibold text-gray-900">{task.title}</h2>

          {task.description && (
            <p className="text-gray-600 whitespace-pre-wrap">{task.description}</p>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Status:</span>
              <span className="ml-2 font-medium">{task.status}</span>
            </div>
            <div>
              <span className="text-gray-500">Priority:</span>
              <span className="ml-2 font-medium">{task.priority}</span>
            </div>
            <div>
              <span className="text-gray-500">Complexity:</span>
              <span className="ml-2 font-medium">{task.complexity}</span>
            </div>
            <div>
              <span className="text-gray-500">Progress:</span>
              <span className="ml-2 font-medium">{task.progress}%</span>
            </div>
            {task.assigned_agent && (
              <div className="col-span-2">
                <span className="text-gray-500">Assigned Agent:</span>
                <span className="ml-2 font-medium font-mono text-xs">{task.assigned_agent}</span>
              </div>
            )}
            {task.error_message && (
              <div className="col-span-2">
                <span className="text-gray-500">Error:</span>
                <span className="ml-2 text-red-600">{task.error_message}</span>
              </div>
            )}
            {task.result && (
              <div className="col-span-2">
                <span className="text-gray-500">Result:</span>
                <span className="ml-2 text-green-600">{task.result}</span>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400 pt-4 border-t">
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
