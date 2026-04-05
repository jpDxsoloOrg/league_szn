import { useState, useEffect } from 'react';
import { transfersApi } from '../../services/api';
import type { TransferRequestWithDetails } from '../../types';
import './ManageTransfers.css';

type TransferTab = 'pending' | 'history';

export default function ManageTransfers() {
  const [activeTab, setActiveTab] = useState<TransferTab>('pending');
  const [pendingRequests, setPendingRequests] = useState<TransferRequestWithDetails[]>([]);
  const [historyRequests, setHistoryRequests] = useState<TransferRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const all = await transfersApi.getAllRequests();
      setPendingRequests(all.filter((r) => r.status === 'pending'));
      setHistoryRequests(all.filter((r) => r.status !== 'pending'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transfer requests');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
      setSubmitting(requestId);
      setError(null);
      await transfersApi.reviewRequest(requestId, {
        status,
        reviewNote: reviewNote[requestId] || undefined,
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
      status === 'approved' ? 'transfer-badge approved' :
      status === 'rejected' ? 'transfer-badge rejected' :
      'transfer-badge pending';
    return <span className={cls}>{status}</span>;
  };

  if (loading) return <div className="loading">Loading transfer requests...</div>;

  return (
    <div className="manage-transfers">
      <h2>Division Transfer Requests</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="transfer-tabs">
        <button
          className={`transfer-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending ({pendingRequests.length})
        </button>
        <button
          className={`transfer-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History ({historyRequests.length})
        </button>
      </div>

      {activeTab === 'pending' && (
        pendingRequests.length === 0 ? (
          <p className="no-data">No pending transfer requests.</p>
        ) : (
          <div className="transfer-list">
            {pendingRequests.map((req) => (
              <div key={req.requestId} className="transfer-card">
                <div className="transfer-card-header">
                  <span className="transfer-player">{req.playerName}</span>
                  {statusBadge(req.status)}
                  <span className="transfer-date">{formatDate(req.createdAt)}</span>
                </div>
                <div className="transfer-card-body">
                  <div className="transfer-division-row">
                    <span className="transfer-from">{req.fromDivisionName}</span>
                    <span className="transfer-arrow">→</span>
                    <span className="transfer-to">{req.toDivisionName}</span>
                  </div>
                  <p className="transfer-reason">
                    <strong>Reason:</strong> {req.reason}
                  </p>
                  <div className="transfer-review-row">
                    <input
                      type="text"
                      placeholder="Optional note..."
                      value={reviewNote[req.requestId] || ''}
                      onChange={(e) =>
                        setReviewNote((prev) => ({ ...prev, [req.requestId]: e.target.value }))
                      }
                      className="transfer-note-input"
                    />
                    <button
                      className="approve-btn"
                      onClick={() => handleReview(req.requestId, 'approved')}
                      disabled={submitting === req.requestId}
                    >
                      {submitting === req.requestId ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      className="reject-btn"
                      onClick={() => handleReview(req.requestId, 'rejected')}
                      disabled={submitting === req.requestId}
                    >
                      {submitting === req.requestId ? 'Processing...' : 'Reject'}
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
          <p className="no-data">No processed transfer requests yet.</p>
        ) : (
          <table className="transfers-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
                <th>Reviewed By</th>
                <th>Note</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {historyRequests.map((req) => (
                <tr key={req.requestId}>
                  <td>{req.playerName}</td>
                  <td>{req.fromDivisionName}</td>
                  <td>{req.toDivisionName}</td>
                  <td>{statusBadge(req.status)}</td>
                  <td>{req.reviewedBy ?? '—'}</td>
                  <td>{req.reviewNote ?? '—'}</td>
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
