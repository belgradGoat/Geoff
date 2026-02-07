import { useState, useEffect } from 'react'
import { orchestrator, PullRequestDetail, PRChangedFile } from '../../lib/orchestrator'
import { PRDiffViewer } from './PRDiffViewer'
import { PRComments } from './PRComments'
import { PRActions } from './PRActions'
import { AssignToAgentDialog } from './AssignToAgentDialog'

interface PRDetailModalProps {
  projectId: string
  prNumber: number
  onClose: () => void
  onPRUpdated?: () => void
}

type Tab = 'overview' | 'files' | 'comments'

export function PRDetailModal({ projectId, prNumber, onClose, onPRUpdated }: PRDetailModalProps) {
  const [detail, setDetail] = useState<PullRequestDetail | null>(null)
  const [files, setFiles] = useState<PRChangedFile[]>([])
  const [loading, setLoading] = useState(true)
  const [filesLoading, setFilesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showAssignDialog, setShowAssignDialog] = useState(false)

  useEffect(() => {
    loadDetail()
  }, [projectId, prNumber])

  useEffect(() => {
    if (activeTab === 'files' && files.length === 0 && !filesLoading) {
      loadFiles()
    }
  }, [activeTab])

  const loadDetail = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await orchestrator.getPullRequestDetail(projectId, prNumber)
      setDetail(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const loadFiles = async () => {
    setFilesLoading(true)
    try {
      const data = await orchestrator.getPullRequestFiles(projectId, prNumber)
      setFiles(data.files)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFilesLoading(false)
    }
  }

  const handlePRAction = () => {
    loadDetail()
    onPRUpdated?.()
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'files', label: 'Files', count: detail?.changed_files },
    { id: 'comments', label: 'Comments', count: detail ? detail.comments.length + detail.reviews.length : undefined },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 pt-8 overflow-y-auto">
      <div className="bg-geoff-card border border-geoff-border rounded-lg shadow-xl w-full max-w-4xl mb-8">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-geoff-border">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="text-sm text-geoff-text-muted animate-pulse">Loading PR #{prNumber}...</div>
            ) : detail ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    detail.state === 'open'
                      ? 'bg-geoff-success-dim text-geoff-success'
                      : detail.state === 'merged'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-geoff-error-dim text-geoff-error'
                  }`}>
                    {detail.state}
                  </span>
                  <span className="text-xs text-geoff-text-muted">#{detail.number}</span>
                  {detail.review_status !== 'pending' && (
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      detail.review_status === 'approved'
                        ? 'bg-geoff-success-dim text-geoff-success'
                        : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      {detail.review_status === 'approved' ? 'Approved' : 'Changes Requested'}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-medium text-geoff-text">{detail.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-geoff-text-muted">
                  <span>{detail.author}</span>
                  <span>{detail.head_branch} → {detail.base_branch}</span>
                  <span className="text-geoff-success">+{detail.additions}</span>
                  <span className="text-geoff-error">-{detail.deletions}</span>
                  <span>{detail.changed_files} files</span>
                </div>
                {detail.labels.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {detail.labels.map(label => (
                      <span key={label} className="px-2 py-0.5 text-xs bg-geoff-accent-dim text-geoff-accent rounded-full">
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-geoff-text-muted hover:text-geoff-text ml-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="m-4 p-2 bg-geoff-error-dim border border-geoff-error/30 rounded text-xs text-geoff-error">
            {error}
          </div>
        )}

        {/* Tab navigation */}
        {detail && (
          <>
            <div className="flex gap-1 px-4 pt-3 border-b border-geoff-border">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-geoff-accent text-geoff-accent'
                      : 'border-transparent text-geoff-text-muted hover:text-geoff-text'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-geoff-surface rounded-full">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {detail.body ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap text-sm text-geoff-text bg-geoff-surface p-4 rounded-lg border border-geoff-border">
                        {detail.body}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-sm text-geoff-text-muted italic">No description provided.</div>
                  )}

                  {detail.mergeable && detail.state === 'open' && (
                    <div className="flex items-center gap-2 p-2 bg-geoff-success-dim border border-geoff-success/30 rounded text-xs text-geoff-success">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      This branch has no conflicts with the base branch
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'files' && (
                filesLoading ? (
                  <div className="text-sm text-geoff-text-muted animate-pulse">Loading files...</div>
                ) : (
                  <PRDiffViewer files={files} />
                )
              )}

              {activeTab === 'comments' && (
                <PRComments
                  projectId={projectId}
                  prNumber={prNumber}
                  comments={detail.comments}
                  reviews={detail.reviews}
                  onCommentAdded={loadDetail}
                />
              )}
            </div>

            {/* Actions footer */}
            <div className="border-t border-geoff-border p-4">
              <PRActions
                projectId={projectId}
                prNumber={prNumber}
                state={detail.state}
                mergeable={detail.mergeable}
                onAction={handlePRAction}
                onAssignToAgent={() => setShowAssignDialog(true)}
              />
            </div>
          </>
        )}
      </div>

      {showAssignDialog && detail && (
        <AssignToAgentDialog
          projectId={projectId}
          pr={detail}
          onClose={() => setShowAssignDialog(false)}
          onAssigned={() => {
            setShowAssignDialog(false)
            onPRUpdated?.()
          }}
        />
      )}
    </div>
  )
}
