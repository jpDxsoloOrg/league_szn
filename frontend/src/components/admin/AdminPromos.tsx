import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PromoType } from '../../types/promo';
import { promosApi } from '../../services/api/promos.api';
import type { PromoWithContext } from '../../types/promo';
import './AdminPromos.css';

const PROMO_TYPE_OPTIONS: { value: '' | PromoType; labelKey: string; fallback: string }[] = [
  { value: '', labelKey: 'promos.admin.all', fallback: 'All' },
  { value: 'open-mic', labelKey: 'promos.types.open-mic', fallback: 'Open Mic' },
  { value: 'call-out', labelKey: 'promos.types.call-out', fallback: 'Call-Out' },
  { value: 'response', labelKey: 'promos.types.response', fallback: 'Response' },
  { value: 'pre-match', labelKey: 'promos.types.pre-match', fallback: 'Pre-Match' },
  { value: 'post-match', labelKey: 'promos.types.post-match', fallback: 'Post-Match' },
  { value: 'championship', labelKey: 'promos.types.championship', fallback: 'Championship' },
  { value: 'return', labelKey: 'promos.types.return', fallback: 'Return' },
];

function getTotalReactions(promo: PromoWithContext): number {
  return Object.values(promo.reactionCounts).reduce((sum, count) => sum + count, 0);
}

function truncateContent(content: string, maxLength: number = 50): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

export default function AdminPromos() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [promos, setPromos] = useState<PromoWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'' | PromoType>('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showBulkClearModal, setShowBulkClearModal] = useState(false);
  const [bulkClearing, setBulkClearing] = useState(false);

  const loadPromos = useCallback(async () => {
    try {
      setError(null);
      const data = await promosApi.getAll({ includeHidden: true });
      setPromos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load promos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPromos();
  }, [loadPromos]);

  const filteredPromos = useMemo(() => {
    if (!filterType) return promos;
    return promos.filter((p) => p.promoType === filterType);
  }, [promos, filterType]);

  const showFeedback = (message: string, type: 'success' | 'error') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleTogglePin = async (promo: PromoWithContext) => {
    setSubmitting(promo.promoId);
    try {
      const updated = await promosApi.adminUpdate(promo.promoId, { isPinned: !promo.isPinned });
      setPromos((prev) =>
        prev.map((p) => (p.promoId === promo.promoId ? { ...p, isPinned: updated.isPinned } : p))
      );
      showFeedback(
        `${updated.isPinned ? 'Pinned' : 'Unpinned'}: ${promo.wrestlerName}'s promo`,
        'success'
      );
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Failed to update promo', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleToggleHide = async (promo: PromoWithContext) => {
    setSubmitting(promo.promoId);
    try {
      const updated = await promosApi.adminUpdate(promo.promoId, { isHidden: !promo.isHidden });
      setPromos((prev) =>
        prev.map((p) => (p.promoId === promo.promoId ? { ...p, isHidden: updated.isHidden } : p))
      );
      showFeedback(
        `${updated.isHidden ? 'Hidden' : 'Unhidden'}: ${promo.wrestlerName}'s promo`,
        'success'
      );
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Failed to update promo', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async (promo: PromoWithContext) => {
    setSubmitting(promo.promoId);
    try {
      await promosApi.delete(promo.promoId);
      showFeedback(t('promos.admin.deleted', 'Deleted') + `: ${promo.wrestlerName}'s promo`, 'success');
      await loadPromos();
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Failed to delete promo', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleBulkClearHidden = async () => {
    setBulkClearing(true);
    try {
      const result = await promosApi.bulkDelete({ isHidden: true });
      showFeedback(result.message, 'success');
      setShowBulkClearModal(false);
      await loadPromos();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to clear hidden promos',
        'error'
      );
    } finally {
      setBulkClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-promos">
        <div className="admin-promos-header">
          <h3>{t('promos.admin.title', 'Manage Promos')}</h3>
        </div>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-promos">
        <div className="admin-promos-header">
          <h3>{t('promos.admin.title', 'Manage Promos')}</h3>
        </div>
        <div className="admin-promos-error">{error}</div>
        <button onClick={loadPromos}>Retry</button>
      </div>
    );
  }

  return (
    <div className="admin-promos">
      <div className="admin-promos-header">
        <h3>{t('promos.admin.title', 'Manage Promos')}</h3>
        <div className="admin-promos-filter">
          <label htmlFor="promo-type-filter">
            {t('promos.admin.filterByType', 'Filter by Type')}
          </label>
          <select
            id="promo-type-filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as '' | PromoType)}
          >
            {PROMO_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey, opt.fallback)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="admin-promos-btn-clear-hidden"
          onClick={() => setShowBulkClearModal(true)}
        >
          {t('promos.admin.clearHidden', 'Clear hidden promos')}
        </button>
      </div>

      {showBulkClearModal && (
        <div className="admin-promos-modal-overlay" role="dialog" aria-modal="true">
          <div className="admin-promos-modal">
            <p>{t('promos.admin.clearHiddenConfirm', 'Are you sure you want to permanently delete all hidden promos?')}</p>
            <div className="admin-promos-modal-actions">
              <button
                type="button"
                className="admin-promos-btn-modal-cancel"
                onClick={() => setShowBulkClearModal(false)}
                disabled={bulkClearing}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                className="admin-promos-btn-modal-confirm"
                onClick={handleBulkClearHidden}
                disabled={bulkClearing}
              >
                {bulkClearing ? t('common.loading', 'Clearing...') : t('promos.admin.clearHidden', 'Clear hidden promos')}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div className={`admin-promos-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      <div className="admin-promos-table-wrapper">
        <table className="admin-promos-table">
          <thead>
            <tr>
              <th>{t('promos.admin.player', 'Player')}</th>
              <th>{t('promos.admin.type', 'Type')}</th>
              <th>{t('promos.admin.content', 'Content')}</th>
              <th>{t('promos.admin.reactions', 'Reactions')}</th>
              <th>{t('promos.admin.date', 'Date')}</th>
              <th>{t('promos.admin.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredPromos.map((promo) => (
              <tr key={promo.promoId} className={promo.isHidden ? 'hidden-row' : ''}>
                <td className="player-cell">
                  <span className="wrestler-name">{promo.wrestlerName}</span>
                  <span className="player-name">({promo.playerName})</span>
                </td>
                <td>
                  <span className="type-badge">
                    {t(`promos.types.${promo.promoType}`, promo.promoType)}
                  </span>
                </td>
                <td className="content-cell">
                  {truncateContent(promo.title ? `${promo.title} - ${promo.content}` : promo.content)}
                </td>
                <td className="reactions-cell">{getTotalReactions(promo)}</td>
                <td className="date-cell">{formatDate(promo.createdAt)}</td>
                <td className="actions-cell">
                  {promo.promoType === 'call-out' && promo.targetPlayerId && (
                    <button
                      type="button"
                      className="action-btn schedule-btn"
                      onClick={() =>
                        navigate('/admin/schedule', {
                          state: { fromPromo: promo },
                        })
                      }
                      title={t('promos.admin.scheduleMatch', 'Schedule Match')}
                    >
                      {t('promos.admin.scheduleMatch', 'Schedule Match')}
                    </button>
                  )}
                  <button
                    className={`action-btn pin-btn ${promo.isPinned ? 'active' : ''}`}
                    onClick={() => handleTogglePin(promo)}
                    disabled={submitting === promo.promoId}
                    title={promo.isPinned
                      ? t('promos.admin.unpin', 'Unpin')
                      : t('promos.admin.pin', 'Pin')}
                  >
                    {promo.isPinned
                      ? t('promos.admin.unpin', 'Unpin')
                      : t('promos.admin.pin', 'Pin')}
                  </button>
                  <button
                    className={`action-btn hide-btn ${promo.isHidden ? 'active' : ''}`}
                    onClick={() => handleToggleHide(promo)}
                    disabled={submitting === promo.promoId}
                    title={promo.isHidden
                      ? t('promos.admin.unhide', 'Unhide')
                      : t('promos.admin.hide', 'Hide')}
                  >
                    {promo.isHidden
                      ? t('promos.admin.unhide', 'Unhide')
                      : t('promos.admin.hide', 'Hide')}
                  </button>
                  <button
                    type="button"
                    className="action-btn delete-btn"
                    onClick={() => handleDelete(promo)}
                    disabled={submitting === promo.promoId}
                    title={t('promos.admin.delete', 'Delete')}
                  >
                    {submitting === promo.promoId ? '...' : t('promos.admin.delete', 'Delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
