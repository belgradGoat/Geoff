import { useState, FormEvent } from 'react'
import { useTasks } from '../../hooks/useTasks'

export function QuickAdd() {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const addTask = useTasks((state) => state.addTask)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      await addTask(title.trim(), priority)
      setTitle('')
      setPriority(0)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4">
      <div className="flex gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a new task..."
          className="input flex-1"
          disabled={isSubmitting}
        />
        <select
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="input w-32"
          disabled={isSubmitting}
        >
          <option value={0}>Normal</option>
          <option value={1}>Low</option>
          <option value={2}>Medium</option>
          <option value={3}>High</option>
          <option value={4}>Urgent</option>
        </select>
        <button
          type="submit"
          disabled={isSubmitting || !title.trim()}
          className="btn-primary"
        >
          {isSubmitting ? 'Adding...' : 'Add Task'}
        </button>
      </div>
    </form>
  )
}
