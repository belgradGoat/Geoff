import { useState, useRef, FormEvent, ChangeEvent } from 'react'
import { useTasks } from '../../hooks/useTasks'
import { useAgents } from '../../hooks/useAgents'
import { useProjects } from '../../hooks/useProjects'
import { useChains, ChainType } from '../../hooks/useChains'
import { TaskAttachment } from '../../lib/supabase'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB per file
const MAX_TOTAL_SIZE = 10 * 1024 * 1024 // 10MB total
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return '🖼️'
  if (type === 'application/pdf') return '📄'
  if (type === 'application/json') return '📋'
  return '📎'
}

export function QuickAdd() {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(0)
  const [chainType, setChainType] = useState<ChainType | 'none'>('none')
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isLaunchingRef = useRef(false)
  const addTask = useTasks((state) => state.addTask)
  const projectFilter = useTasks((state) => state.projectFilter)
  const { launchAgent, selectAgent } = useAgents()
  const { executeChain } = useChains()
  const { projects } = useProjects()
  const selectedProject = projects.find(p => p.id === projectFilter)

  const totalSize = attachments.reduce((sum, a) => sum + a.size, 0)

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setFileError(null)
    const newAttachments: TaskAttachment[] = []

    for (const file of Array.from(files)) {
      // Check file type
      if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(md|txt|json|csv)$/i)) {
        setFileError(`Unsupported file type: ${file.name}`)
        continue
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        setFileError(`File too large (max 5MB): ${file.name}`)
        continue
      }

      // Check total size
      const newTotal = totalSize + newAttachments.reduce((s, a) => s + a.size, 0) + file.size
      if (newTotal > MAX_TOTAL_SIZE) {
        setFileError('Total attachments too large (max 10MB)')
        break
      }

      // Convert to base64
      try {
        const data = await fileToBase64(file)
        newAttachments.push({
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          data,
        })
      } catch {
        setFileError(`Failed to read file: ${file.name}`)
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments])

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
    setFileError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      const task = await addTask(title.trim(), priority, undefined, undefined, attachments)

      // If a chain type is selected, queue chain execution for this task
      if (task && chainType !== 'none') {
        await executeChain(task.id, chainType)
      }

      setTitle('')
      setPriority(0)
      setChainType('none')
      setAttachments([])
      setFileError(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getDefaultPrompt = () => {
    const projectContext = selectedProject
      ? `Filter tasks to project_id "${projectFilter}".`
      : ''

    return `You have access to the agent-task-planner MCP server. Use it to:
1. Call task_get_ready to find tasks that are ready to be worked on. ${projectContext}
2. Pick the highest priority task and call task_claim with your agent ID to claim it.
3. Read the task title, description, and any attachments to understand what needs to be done.
4. Complete the work described in the task.
5. Call task_complete when done, or task_fail if you encounter an issue.

Work through one task at a time. Be thorough and follow the task requirements.`
  }

  const handleLaunch = async () => {
    // Use ref to prevent duplicate launches from rapid clicks
    // State updates are async and can be bypassed with fast double-clicks
    if (isLaunchingRef.current) {
      return
    }
    isLaunchingRef.current = true
    setIsLaunching(true)
    try {
      const prompt = getDefaultPrompt()
      const taskTitle = selectedProject
        ? `Working on ${selectedProject.name} tasks`
        : 'Working on ready tasks'
      const agent = await launchAgent(
        prompt,
        selectedProject?.path || undefined,
        projectFilter || undefined,
        undefined,
        taskTitle
      )
      if (agent) {
        selectAgent(agent.id)
      }
    } finally {
      setIsLaunching(false)
      isLaunchingRef.current = false
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3">
      {/* Mobile: stacked layout, Desktop: horizontal layout */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a new task..."
          className="input w-full sm:flex-1"
          disabled={isSubmitting}
        />
        <div className="flex gap-3">
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="input flex-1 sm:flex-none sm:w-32"
            disabled={isSubmitting}
          >
            <option value={0}>Normal</option>
            <option value={1}>Low</option>
            <option value={2}>Medium</option>
            <option value={3}>High</option>
            <option value={4}>Urgent</option>
          </select>
          <select
            value={chainType}
            onChange={(e) => setChainType(e.target.value as ChainType | 'none')}
            className="input flex-1 sm:flex-none sm:w-40"
            disabled={isSubmitting}
          >
            <option value="none">No Chain</option>
            <option value="research">Research Chain</option>
            <option value="development">Dev Chain</option>
          </select>
          <button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="btn-primary whitespace-nowrap"
          >
            {isSubmitting ? 'Adding...' : 'Add Task'}
          </button>
          <button
            type="button"
            onClick={handleLaunch}
            disabled={isLaunching}
            className="btn-secondary whitespace-nowrap"
          >
            {isLaunching ? 'Launching...' : 'Launch Tasks'}
          </button>
        </div>
      </div>

      {/* File upload section */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSubmitting}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-geoff-text-muted border border-geoff-border rounded-lg hover:bg-geoff-surface transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          Attach files
        </button>
        <span className="text-xs text-geoff-text-dim hidden sm:inline">
          Images, PDFs, text files (max 5MB each)
        </span>
      </div>

      {/* Error message */}
      {fileError && (
        <div className="text-sm text-geoff-error">
          {fileError}
        </div>
      )}

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-2 py-1 bg-geoff-surface border border-geoff-border rounded-lg text-sm"
            >
              <span>{getFileIcon(attachment.type)}</span>
              <span className="text-geoff-text truncate max-w-[150px]" title={attachment.name}>
                {attachment.name}
              </span>
              <span className="text-geoff-text-dim text-xs">
                {formatFileSize(attachment.size)}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                className="text-geoff-text-dim hover:text-geoff-error transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <div className="text-xs text-geoff-text-dim self-center">
            Total: {formatFileSize(totalSize)}
          </div>
        </div>
      )}
    </form>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
