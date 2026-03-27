import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { stablesApi } from '../../services/api/stables.api';
import type { Stable, StableStatus } from '../../types/stable';
import './ManageStables.css';

const ALL_STATUSES: StableStatus[] = ['pending', 'approved', 'active', 'disbanded'];

export default function ManageStables() {
  const { t } = useTranslation();
  const [stables, setStables] = useState<Stable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StableStatus | 'all'>('all');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const loadStables = useCallback(async () => {
    try {
      setError(null);
      const data = await stablesApi.getAll();
      setStables(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStables();
  }, [loadStables]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return stables;
    return stables.filter((s) => s.status === statusFilter);
  }, [stables, statusFilter]);

  const showFeedback = (message: string, type: 'success' | 'error') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleApprove = async (stable: Stable) => {
    setSubmitting(stable.stableId);
    try {
      await stablesApi.approve(stable.stableId);
      showFeedback(
        t('stables.admin.approved', 'Approved') + `: ${stable.name}`,
        'success'
      );
      await loadStables();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to approve stable',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleReject = async (stable: Stable) => {
    setSubmitting(stable.stableId);
    try {
      await stablesApi.reject(stable.stableId);
      showFeedback(
        t('stables.admin.rejected', 'Rejected') + `: ${stable.name}`,
        'success'
      );
      await loadStables();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to reject stable',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleDisband = async (stable: Stable) => {
    setSubmitting(stable.stableId);
    try {
      await stablesApi.disband(stable.stableId);
      showFeedback(
        t('stables.admin.disbanded', 'Disbanded') + `: ${stable.name}`,
        'success'
      );
      await loadStables();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to disband stable',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async (stable: Stable) => {
    setSubmitting(stable.stableId);
    try {
      await stablesApi.delete(stable.stableId);
      showFeedback(
        t('stables.admin.deleted', 'Deleted') + `: ${stable.name}`,
        'success'
      );
      await loadStables();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to delete stable',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="admin-stables">
        <h3>{t('stables.admin.title', 'Manage Stables')}</h3>
        <div className="admin-stables-empty"><p>Loading...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-stables">
        <h3>{t('stables.admin.title', 'Manage Stables')}</h3>
        <div className="admin-stables-feedback error">{error}</div>
        <button onClick={loadStables}>Retry</button>
      </div>
    );
  }

  return (
    <div className="admin-stables">
      <h3>{t('stables.admin.title', 'Manage Stables')}</h3>

      <div className="admin-stables-controls">
        <div className="admin-stables-filter">
          <label>{t('stables.admin.filterByStatus', 'Filter by status')}:</label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as StableStatus | 'all')
            }
          >
            <option value="all">{t('stables.admin.all', 'All')}</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`stables.status.${s}`, s.charAt(0).toUpperCase() + s.slice(1))}
              </option>
            ))}
          </select>
        </div>
        <span className="admin-stables-count">
          {filtered.length} {filtered.length === 1 ? 'stable' : 'stables'}
        </span>
      </div>

      {feedback && (
        <div className={`admin-stables-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="admin-stables-empty">
          <p>{t('stables.admin.noStables', 'No stables found')}</p>
        </div>
      ) : (
        <table className="admin-stables-table">
          <thead>
            <tr>
              <th>{t('stables.admin.name', 'Name')}</th>
              <th>{t('stables.admin.members', 'Members')}</th>
              <th>{t('stables.admin.status', 'Status')}</th>
              <th>{t('stables.admin.record', 'W/L/D')}</th>
              <th>{t('stables.admin.created', 'Created')}</th>
              <th>{t('stables.admin.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((stable) => (
              <tr key={stable.stableId}>
                <td>
                  <span className="admin-stables-name">{stable.name}</span>
                </td>
                <td>
                  <span className="admin-stables-member-count">
                    {stable.memberIds.length} {stable.memberIds.length === 1 ? 'member' : 'members'}
                  </span>
                </td>
                <td>
                  <span className={`stables-status-badge ${stable.status}`}>
                    {t(`stables.status.${stable.status}`, stable.status)}
                  </span>
                </td>
                <td>
                  <span className="admin-stables-record">
                    {stable.wins}-{stable.losses}-{stable.draws}
                  </span>
                </td>
                <td>{formatDate(stable.createdAt)}</td>
                <td>
                  <div className="admin-stables-actions">
                    {stable.status === 'pending' && (
                      <>
                        <button
                          className="admin-btn-approve"
                          onClick={() => handleApprove(stable)}
                          disabled={submitting === stable.stableId}
                        >
                          {submitting === stable.stableId
                            ? '...'
                            : t('stables.admin.approve', 'Approve')}
                        </button>
                        <button
                          className="admin-btn-reject"
                          onClick={() => handleReject(stable)}
                          disabled={submitting === stable.stableId}
                        >
                          {submitting === stable.stableId
                            ? '...'
                            : t('stables.admin.reject', 'Reject')}
                        </button>
                      </>
                    )}
                    {(stable.status === 'approved' || stable.status === 'active') && (
                      <button
                        className="admin-btn-disband"
                        onClick={() => handleDisband(stable)}
                        disabled={submitting === stable.stableId}
                      >
                        {submitting === stable.stableId
                          ? '...'
                          : t('stables.admin.disband', 'Disband')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="admin-btn-delete"
                      onClick={() => handleDelete(stable)}
                      disabled={submitting === stable.stableId}
                      title={t('stables.admin.delete', 'Delete')}
                    >
                      {submitting === stable.stableId ? '...' : t('stables.admin.delete', 'Delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
