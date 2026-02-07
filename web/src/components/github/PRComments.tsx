import { useState } from 'react'
import { orchestrator, PRComment, PRReview } from '../../lib/orchestrator'

interface PRCommentsProps {
  projectId: string
  prNumber: number
  comments: PRComment[]
  reviews: PRReview[]
  onCommentAdded: () => void
}

export function PRComments({ projectId, prNumber, comments, reviews, onCommentAdded }: PRCommentsProps) {
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Merge comments and reviews into a single timeline sorted by date
  const timeline = [
    ...comments.map(c => ({ type: 'comment' as const, author: c.author, body: c.body, date: c.created_at, state: undefined as string | undefined })),
    ...reviews.filter(r => r.body || r.state !== 'commented').map(r => ({ type: 'review' as const, author: r.author, body: r.body, date: r.submitted_at, state: r.state })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      await orchestrator.addPRComment(projectId, prNumber, newComment.trim())
      setNewComment('')
      onCommentAdded()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const reviewStateLabel = (state: string) => {
    switch (state) {
      case 'approved': return { text: 'approved this PR', color: 'text-geoff-success' }
      case 'changes_requested': return { text: 'requested changes', color: 'text-orange-400' }
      default: return { text: 'reviewed', color: 'text-geoff-text-muted' }
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString()
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-4">
      {timeline.length === 0 ? (
        <div className="text-sm text-geoff-text-muted">No comments or reviews yet.</div>
      ) : (
        <div className="space-y-3">
          {timeline.map((item, i) => (
            <div key={i} className="p-3 bg-geoff-surface rounded-lg border border-geoff-border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-geoff-text">{item.author}</span>
                {item.type === 'review' && item.state && (
                  <span className={`text-xs ${reviewStateLabel(item.state).color}`}>
                    {reviewStateLabel(item.state).text}
                  </span>
                )}
                <span className="text-xs text-geoff-text-muted ml-auto">
                  {formatDate(item.date)}
                </span>
              </div>
              {item.body && (
                <pre className="text-sm text-geoff-text whitespace-pre-wrap">{item.body}</pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add comment */}
      <div className="space-y-2 pt-2 border-t border-geoff-border">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Leave a comment..."
          rows={3}
          className="w-full px-3 py-2 bg-geoff-surface border border-geoff-border rounded text-sm text-geoff-text resize-none"
        />
        {error && (
          <div className="text-xs text-geoff-error">{error}</div>
        )}
        <div className="flex justify-end">
          <button
            onClick={handleSubmitComment}
            disabled={!newComment.trim() || submitting}
            className="px-4 py-2 text-sm bg-geoff-accent text-white rounded hover:bg-geoff-accent-hover disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Submitting...' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  )
}
