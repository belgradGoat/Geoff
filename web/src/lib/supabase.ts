import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

// Types for the database
export type TaskStatus = 'queued' | 'ready' | 'assigned' | 'in_progress' | 'done' | 'failed' | 'blocked'
export type TaskComplexity = 'trivial' | 'small' | 'medium' | 'large' | 'unknown'
export type LogEventType = 'created' | 'status_change' | 'note' | 'error' | 'completed' | 'failed'

export interface TaskAttachment {
  name: string
  type: string
  size: number
  data: string // base64 encoded
}

export interface Project {
  id: string
  name: string
  path: string
  description: string | null
  is_active: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  complexity: TaskComplexity
  priority: number
  parent_id: string | null
  project_id: string | null
  projects?: Project | null
  depends_on: string[]
  assigned_agent: string | null
  progress: number
  result: string | null
  error_message: string | null
  retry_count: number
  max_retries: number
  context: Record<string, unknown>
  tags: string[]
  attachments: TaskAttachment[]
  estimated_minutes: number | null
  actual_minutes: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface TaskLog {
  id: string
  task_id: string
  event_type: LogEventType
  message: string | null
  old_status: TaskStatus | null
  new_status: TaskStatus | null
  agent_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}
