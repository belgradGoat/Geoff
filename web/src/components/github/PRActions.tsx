import { useState } from 'react'
import { orchestrator } from '../../lib/orchestrator'

interface PRActionsProps {
  projectId: string
  prNumber: number
  state: string
  mergeable: boolean
  onAction: () => void
  onAssignToAgent: () => void
}

export function PRActions({ projectId, prNumber, state, mergeable, onAction, onAssignToAgent }: PRActionsProps) {
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showReviewInput, setShowReviewInput] = useState(false)
  const [reviewBody, setReviewBody] = useState('')
  const [mergeMethod, setMergeMethod] = useState('merge')
  const [showConfirmClose, setShowConfirmClose] = useState(false)

  const handleAction = async (action: () => Promise<unknown>, label: string) => {
    setActing(label)
    setError(null)
    try {
      await action()
      onAction()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setActing(null)
    }
  }

  if (state !== 'open') {
    return (
      <div className="flex items-center justify-between">
        <div className="text-sm text-geoff-text-muted">
          This PR is {state}.
        </div>
        <button
          onClick={onAssignToAgent}
          className="px-3 py-1.5 text-sm bg-geoff-accent text-white rounded hover:bg-geoff-accent-hover transition-colors"
        >
          Assign to Agent
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-2 bg-geoff-error-dim border border-geoff-error/30 rounded text-xs text-geoff-error">
          {error}
        </div>
      )}

      {/* Review input area */}
      {showReviewInput && (
        <div className="space-y-2 p-3 bg-geoff-surface rounded-lg border border-geoff-border">
          <textarea
            value={reviewBody}
            onChange={(e) => setReviewBody(e.target.value)}
            placeholder="Describe the changes needed..."
            rows={3}
            className="w-full px-3 py-2 bg-geoff-bg border border-geoff-border rounded text-sm text-geoff-text resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowReviewInput(false); setReviewBody('') }}
              className="px-3 py-1.5 text-sm text-geoff-text-muted hover:text-geoff-text"
            >
              Cancel
            </button>
            <button
              onClick={() => handleAction(
                () => orchestrator.submitPRReview(projectId, prNumber, 'request_changes', reviewBody),
                'request_changes'
              ).then(() => { setShowReviewInput(false); setReviewBody('') })}
              disabled={!reviewBody.trim() || acting !== null}
              className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {acting === 'request_changes' ? 'Submitting...' : 'Request Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Close confirmation */}
      {showConfirmClose && (
        <div className="flex items-center gap-2 p-3 bg-geoff-error-dim border border-geoff-error/30 rounded">
          <span className="text-sm text-geoff-error">Close this PR?</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setShowConfirmClose(false)}
              className="px-3 py-1 text-xs text-geoff-text-muted hover:text-geoff-text"
            >
              Cancel
            </button>
            <button
              onClick={() => handleAction(
                () => orchestrator.closePR(projectId, prNumber),
                'close'
              ).then(() => setShowConfirmClose(false))}
              disabled={acting !== null}
              className="px-3 py-1 text-xs bg-geoff-error text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              {acting === 'close' ? 'Closing...' : 'Confirm Close'}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {/* Approve */}
        <button
          onClick={() => handleAction(
            () => orchestrator.submitPRReview(projectId, prNumber, 'approve'),
            'approve'
          )}
          disabled={acting !== null}
          className="px-3 py-1.5 text-sm bg-geoff-success text-white rounded hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {acting === 'approve' ? 'Approving...' : 'Approve'}
        </button>

        {/* Request Changes */}
        <button
          onClick={() => setShowReviewInput(true)}
          disabled={acting !== null}
          className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          Request Changes
        </button>

        {/* Merge */}
        {mergeable && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleAction(
                () => orchestrator.mergePR(projectId, prNumber, mergeMethod),
                'merge'
              )}
              disabled={acting !== null}
              className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded-l hover:bg-purple-600 disabled:opacity-50 transition-colors"
            >
              {acting === 'merge' ? 'Merging...' : 'Merge'}
            </button>
            <select
              value={mergeMethod}
              onChange={(e) => setMergeMethod(e.target.value)}
              className="px-1 py-1.5 text-xs bg-purple-500 text-white rounded-r border-l border-purple-400 hover:bg-purple-600"
            >
              <option value="merge">Merge</option>
              <option value="squash">Squash</option>
              <option value="rebase">Rebase</option>
            </select>
          </div>
        )}

        {/* Close */}
        <button
          onClick={() => setShowConfirmClose(true)}
          disabled={acting !== null}
          className="px-3 py-1.5 text-sm bg-geoff-error text-white rounded hover:brightness-110 disabled:opacity-50 transition-all"
        >
          Close
        </button>

        {/* Assign to Agent */}
        <button
          onClick={onAssignToAgent}
          disabled={acting !== null}
          className="px-3 py-1.5 text-sm bg-geoff-accent text-white rounded hover:bg-geoff-accent-hover disabled:opacity-50 transition-colors ml-auto"
        >
          Assign to Agent
        </button>
      </div>
    </div>
  )
}
