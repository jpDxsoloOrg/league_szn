import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { stablesApi } from '../../services/api/stables.api';
import type { Stable, StableStatus } from '../../types/stable';
import './ManageFactions.css';

const ALL_STATUSES: StableStatus[] = ['pending', 'approved', 'active', 'disbanded'];

export default function ManageFactions() {
  const { t } = useTranslation();
  const [factions, setFactions] = useState<Stable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StableStatus | 'all'>('all');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const loadFactions = useCallback(async () => {
    try {
      setError(null);
      const data = await stablesApi.getAll();
      setFactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFactions();
  }, [loadFactions]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return factions;
    return factions.filter((s) => s.status === statusFilter);
  }, [factions, statusFilter]);

  const showFeedback = (message: string, type: 'success' | 'error') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleApprove = async (faction: Stable) => {
    setSubmitting(faction.stableId);
    try {
      await stablesApi.approve(faction.stableId);
      showFeedback(
        t('stables.admin.approved', 'Approved') + `: ${faction.name}`,
        'success'
      );
      await loadFactions();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to approve stable',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleReject = async (faction: Stable) => {
    setSubmitting(faction.stableId);
    try {
      await stablesApi.reject(faction.stableId);
      showFeedback(
        t('stables.admin.rejected', 'Rejected') + `: ${faction.name}`,
        'success'
      );
      await loadFactions();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to reject stable',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleDisband = async (faction: Stable) => {
    setSubmitting(faction.stableId);
    try {
      await stablesApi.disband(faction.stableId);
      showFeedback(
        t('stables.admin.disbanded', 'Disbanded') + `: ${faction.name}`,
        'success'
      );
      await loadFactions();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to disband stable',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleReactivate = async (faction: Stable) => {
    const confirmMsg = t(
      'stables.admin.confirmReactivate',
      'Reactivate "{{name}}"? Members who have since joined another stable will be skipped.',
      { name: faction.name },
    );
    if (!window.confirm(confirmMsg)) return;
    setSubmitting(faction.stableId);
    try {
      const result = await stablesApi.reactivate(faction.stableId);
      const skipped = result.skippedMembers.length;
      const restored = result.restoredMemberIds.length;
      const base = t('stables.admin.reactivated', 'Reactivated') + `: ${faction.name}`;
      const detail =
        skipped > 0
          ? ` (${restored} restored, ${skipped} skipped)`
          : ` (${restored} restored)`;
      showFeedback(base + detail, 'success');
      await loadFactions();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to reactivate stable',
        'error',
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async (faction: Stable) => {
    setSubmitting(faction.stableId);
    try {
      await stablesApi.delete(faction.stableId);
      showFeedback(
        t('stables.admin.deleted', 'Deleted') + `: ${faction.name}`,
        'success'
      );
      await loadFactions();
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
      <div className="admin-factions">
        <h3>{t('stables.admin.title', 'Manage Stables')}</h3>
        <div className="admin-factions-empty"><p>Loading...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-factions">
        <h3>{t('stables.admin.title', 'Manage Stables')}</h3>
        <div className="admin-factions-feedback error">{error}</div>
        <button onClick={loadFactions}>Retry</button>
      </div>
    );
  }

  return (
    <div className="admin-factions">
      <h3>{t('stables.admin.title', 'Manage Stables')}</h3>

      <div className="admin-factions-controls">
        <div className="admin-factions-filter">
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
        <span className="admin-factions-count">
          {filtered.length} {filtered.length === 1 ? 'stable' : 'stables'}
        </span>
      </div>

      {feedback && (
        <div className={`admin-factions-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="admin-factions-empty">
          <p>{t('stables.admin.noStables', 'No stables found')}</p>
        </div>
      ) : (
        <table className="admin-factions-table">
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
            {filtered.map((faction) => (
              <tr key={faction.stableId}>
                <td>
                  <span className="admin-factions-name">{faction.name}</span>
                </td>
                <td>
                  <span className="admin-factions-member-count">
                    {faction.memberIds.length} {faction.memberIds.length === 1 ? 'member' : 'members'}
                  </span>
                </td>
                <td>
                  <span className={`factions-status-badge ${faction.status}`}>
                    {t(`stables.status.${faction.status}`, faction.status)}
                  </span>
                </td>
                <td>
                  <span className="admin-factions-record">
                    {faction.wins}-{faction.losses}-{faction.draws}
                  </span>
                </td>
                <td>{formatDate(faction.createdAt)}</td>
                <td>
                  <div className="admin-factions-actions">
                    {faction.status === 'pending' && (
                      <>
                        <button
                          className="admin-btn-approve"
                          onClick={() => handleApprove(faction)}
                          disabled={submitting === faction.stableId}
                        >
                          {submitting === faction.stableId
                            ? '...'
                            : t('stables.admin.approve', 'Approve')}
                        </button>
                        <button
                          className="admin-btn-reject"
                          onClick={() => handleReject(faction)}
                          disabled={submitting === faction.stableId}
                        >
                          {submitting === faction.stableId
                            ? '...'
                            : t('stables.admin.reject', 'Reject')}
                        </button>
                      </>
                    )}
                    {(faction.status === 'approved' || faction.status === 'active') && (
                      <button
                        className="admin-btn-disband"
                        onClick={() => handleDisband(faction)}
                        disabled={submitting === faction.stableId}
                      >
                        {submitting === faction.stableId
                          ? '...'
                          : t('stables.admin.disband', 'Disband')}
                      </button>
                    )}
                    {faction.status === 'disbanded' && (
                      <button
                        type="button"
                        className="admin-btn-reactivate"
                        onClick={() => handleReactivate(faction)}
                        disabled={submitting === faction.stableId}
                      >
                        {submitting === faction.stableId
                          ? '...'
                          : t('stables.admin.reactivate', 'Reactivate')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="admin-btn-delete"
                      onClick={() => handleDelete(faction)}
                      disabled={submitting === faction.stableId}
                      title={t('stables.admin.delete', 'Delete')}
                    >
                      {submitting === faction.stableId ? '...' : t('stables.admin.delete', 'Delete')}
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
