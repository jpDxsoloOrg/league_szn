import { useState, useEffect } from 'react';
import { storylineRequestsApi } from '../../services/api';
import type { StorylineRequestWithDetails, StorylineRequestType } from '../../types';
import './ManageStorylineRequests.css';

type StorylineTab = 'pending' | 'history';

const REQUEST_TYPE_LABELS: Record<StorylineRequestType, string> = {
  storyline: 'Storyline',
  backstage_attack: 'Backstage Attack',
  rivalry: 'Rivalry',
};

export default function ManageStorylineRequests() {
  const [activeTab, setActiveTab] = useState<StorylineTab>('pending');
  const [pendingRequests, setPendingRequests] = useState<StorylineRequestWithDetails[]>([]);
  const [historyRequests, setHistoryRequests] = useState<StorylineRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gmNoteMap, setGmNoteMap] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const all = await storylineRequestsApi.getAll();
      setPendingRequests(all.filter((r) => r.status === 'pending'));
      setHistoryRequests(all.filter((r) => r.status !== 'pending'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load storyline requests');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (requestId: string, status: 'acknowledged' | 'declined') => {
    const gmNote = gmNoteMap[requestId]?.trim();
    if (status === 'declined' && !gmNote) {
      setError('A note is required when declining a storyline request.');
      return;
    }
    try {
      setSubmitting(requestId);
      setError(null);
      await storylineRequestsApi.review(requestId, {
        status,
        gmNote: gmNote || undefined,
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review request');
    } finally {
      setSubmitting(null);
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

  const statusBadge = (status: string) => {
    const cls =
      status === 'acknowledged' ? 'storyline-badge acknowledged' :
      status === 'declined' ? 'storyline-badge declined' :
      'storyline-badge pending';
    return <span className={cls}>{status}</span>;
  };

  const typeLabel = (type: string) =>
    REQUEST_TYPE_LABELS[type as StorylineRequestType] ?? type;

  if (loading) return <div className="loading">Loading storyline requests...</div>;

  return (
    <div className="manage-storyline-requests">
      <h2>Storyline Requests</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="storyline-tabs">
        <button
          className={`storyline-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending ({pendingRequests.length})
        </button>
        <button
          className={`storyline-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History ({historyRequests.length})
        </button>
      </div>

      {activeTab === 'pending' && (
        pendingRequests.length === 0 ? (
          <p className="no-data">No pending storyline requests.</p>
        ) : (
          <div className="storyline-list">
            {pendingRequests.map((req) => (
              <div key={req.requestId} className="storyline-card">
                <div className="storyline-card-header">
                  <span className="storyline-requester">{req.requesterName}</span>
                  <span className="storyline-type">{typeLabel(req.requestType)}</span>
                  {statusBadge(req.status)}
                  <span className="storyline-date">{formatDate(req.createdAt)}</span>
                </div>
                <div className="storyline-card-body">
                  <div className="storyline-targets-row">
                    <strong>Target{req.targetPlayerNames.length > 1 ? 's' : ''}:</strong>{' '}
                    {req.targetPlayerNames.join(', ')}
                  </div>
                  <p className="storyline-description">{req.description}</p>
                  <div className="storyline-review-row">
                    <input
                      type="text"
                      placeholder="GM note (required to decline)..."
                      value={gmNoteMap[req.requestId] || ''}
                      onChange={(e) =>
                        setGmNoteMap((prev) => ({ ...prev, [req.requestId]: e.target.value }))
                      }
                      className="storyline-note-input"
                    />
                    <button
                      className="acknowledge-btn"
                      onClick={() => handleReview(req.requestId, 'acknowledged')}
                      disabled={submitting === req.requestId}
                    >
                      {submitting === req.requestId ? 'Processing...' : 'Acknowledge'}
                    </button>
                    <button
                      className="decline-btn"
                      onClick={() => handleReview(req.requestId, 'declined')}
                      disabled={submitting === req.requestId}
                    >
                      {submitting === req.requestId ? 'Processing...' : 'Decline'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'history' && (
        historyRequests.length === 0 ? (
          <p className="no-data">No resolved storyline requests yet.</p>
        ) : (
          <table className="storyline-table">
            <thead>
              <tr>
                <th>Requester</th>
                <th>Type</th>
                <th>Targets</th>
                <th>Description</th>
                <th>Status</th>
                <th>Reviewed By</th>
                <th>GM Note</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {historyRequests.map((req) => (
                <tr key={req.requestId}>
                  <td>{req.requesterName}</td>
                  <td>{typeLabel(req.requestType)}</td>
                  <td>{req.targetPlayerNames.join(', ')}</td>
                  <td className="storyline-description-cell">{req.description}</td>
                  <td>{statusBadge(req.status)}</td>
                  <td>{req.reviewedBy ?? '—'}</td>
                  <td>{req.gmNote ?? '—'}</td>
                  <td>{formatDate(req.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}
