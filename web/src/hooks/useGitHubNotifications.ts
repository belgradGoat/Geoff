import { useState, useEffect, useCallback, useRef } from 'react'
import { orchestrator } from '../lib/orchestrator'

const POLL_INTERVAL = 60_000 // 60 seconds
const STORAGE_KEY_PREFIX = 'geoff-seen-prs-'

export function useGitHubNotifications(projectId: string | null) {
  const [newPRCount, setNewPRCount] = useState(0)
  const [syncedTasks, setSyncedTasks] = useState<{ task_title: string; issue_number: number }[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const getSeenPRs = useCallback((): number[] => {
    if (!projectId) return []
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${projectId}`)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }, [projectId])

  const setSeenPRs = useCallback((prNumbers: number[]) => {
    if (!projectId) return
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${projectId}`, JSON.stringify(prNumbers))
  }, [projectId])

  const poll = useCallback(async () => {
    if (!projectId) return

    try {
      // Check for new PRs
      const response = await orchestrator.listPullRequests(projectId, 'open')
      const seenPRs = getSeenPRs()
      const currentPRNumbers = response.pull_requests.map(pr => pr.number)
      const newOnes = currentPRNumbers.filter(n => !seenPRs.includes(n))
      setNewPRCount(newOnes.length)

      // Run sync check (only fires if sync_issues is enabled on the project)
      try {
        const syncResult = await orchestrator.syncGitHub(projectId)
        if (syncResult.synced.length > 0) {
          setSyncedTasks(syncResult.synced.map(s => ({
            task_title: s.task_title,
            issue_number: s.issue_number,
          })))
        }
      } catch {
        // Sync errors are non-critical
      }
    } catch {
      // Poll errors are non-critical
    }
  }, [projectId, getSeenPRs])

  const markAllSeen = useCallback(() => {
    if (!projectId) return

    orchestrator.listPullRequests(projectId, 'open').then(response => {
      const allNumbers = response.pull_requests.map(pr => pr.number)
      setSeenPRs(allNumbers)
      setNewPRCount(0)
    }).catch(() => {})
  }, [projectId, setSeenPRs])

  const clearSyncedTasks = useCallback(() => {
    setSyncedTasks([])
  }, [])

  useEffect(() => {
    if (!projectId) {
      setNewPRCount(0)
      return
    }

    // Initial poll
    poll()

    // Set up interval
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [projectId, poll])

  return { newPRCount, syncedTasks, markAllSeen, clearSyncedTasks }
}
