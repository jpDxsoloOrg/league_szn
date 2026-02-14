import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { challengesApi } from '../../services/api/challenges.api';
import type { ChallengeStatus, ChallengeWithPlayers } from '../../types/challenge';
import './AdminChallenges.css';

const ALL_STATUSES: ChallengeStatus[] = [
  'pending',
  'accepted',
  'declined',
  'countered',
  'scheduled',
  'expired',
  'cancelled',
];

export default function AdminChallenges() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState<ChallengeWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ChallengeStatus | 'all'>('all');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [showBulkClearModal, setShowBulkClearModal] = useState(false);
  const [bulkClearing, setBulkClearing] = useState(false);

  const loadChallenges = useCallback(async () => {
    try {
      setError(null);
      const data = await challengesApi.getAll();
      setChallenges(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load challenges');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return challenges;
    return challenges.filter((c) => c.status === statusFilter);
  }, [challenges, statusFilter]);

  const showFeedback = (message: string, type: 'success' | 'error') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleCancel = async (challenge: ChallengeWithPlayers) => {
    setSubmitting(challenge.challengeId);
    try {
      await challengesApi.cancel(challenge.challengeId);
      showFeedback(
        `Cancelled: ${challenge.challenger.wrestlerName} vs ${challenge.challenged.wrestlerName}`,
        'success'
      );
      await loadChallenges();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to cancel challenge',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async (challenge: ChallengeWithPlayers) => {
    setSubmitting(challenge.challengeId);
    try {
      await challengesApi.delete(challenge.challengeId);
      showFeedback(
        t('challenges.admin.deleted', 'Deleted') + `: ${challenge.challenger.wrestlerName} vs ${challenge.challenged.wrestlerName}`,
        'success'
      );
      await loadChallenges();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to delete challenge',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleBulkClearResolved = async () => {
    setBulkClearing(true);
    try {
      const result = await challengesApi.bulkDelete({
        statuses: ['cancelled', 'expired', 'scheduled'],
      });
      showFeedback(result.message, 'success');
      setShowBulkClearModal(false);
      await loadChallenges();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to clear resolved challenges',
        'error'
      );
    } finally {
      setBulkClearing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="admin-challenges">
        <h3>{t('challenges.admin.title')}</h3>
        <div className="admin-challenges-empty"><p>Loading...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-challenges">
        <h3>{t('challenges.admin.title')}</h3>
        <div className="admin-challenge-feedback error">{error}</div>
        <button onClick={loadChallenges}>Retry</button>
      </div>
    );
  }

  return (
    <div className="admin-challenges">
      <h3>{t('challenges.admin.title')}</h3>

      <div className="admin-challenges-controls">
        <div className="admin-challenges-filter">
          <label>{t('challenges.admin.filterByStatus')}:</label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ChallengeStatus | 'all')
            }
          >
            <option value="all">{t('challenges.admin.all')}</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`challenges.status.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <span className="admin-challenges-count">
          {filtered.length} {filtered.length === 1 ? 'challenge' : 'challenges'}
        </span>
        <button
          type="button"
          className="admin-btn-clear-resolved"
          onClick={() => setShowBulkClearModal(true)}
        >
          {t('challenges.admin.clearResolved', 'Clear Resolved')}
        </button>
      </div>

      {showBulkClearModal && (
        <div className="admin-challenges-modal-overlay" role="dialog" aria-modal="true">
          <div className="admin-challenges-modal">
            <p>{t('challenges.admin.clearResolvedConfirm', 'Are you sure you want to delete all cancelled, expired, and scheduled challenges?')}</p>
            <div className="admin-challenges-modal-actions">
              <button
                type="button"
                className="admin-btn-modal-cancel"
                onClick={() => setShowBulkClearModal(false)}
                disabled={bulkClearing}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                className="admin-btn-modal-confirm"
                onClick={handleBulkClearResolved}
                disabled={bulkClearing}
              >
                {bulkClearing ? t('common.loading', 'Clearing...') : t('challenges.admin.clearResolved', 'Clear Resolved')}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div className={`admin-challenge-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="admin-challenges-empty">
          <p>{t('challenges.board.noChallenges')}</p>
        </div>
      ) : (
        <table className="admin-challenges-table">
          <thead>
            <tr>
              <th>{t('challenges.admin.challenger')}</th>
              <th>{t('challenges.admin.challenged')}</th>
              <th>{t('challenges.admin.type')}</th>
              <th>{t('challenges.admin.status')}</th>
              <th>{t('challenges.admin.date')}</th>
              <th>{t('challenges.admin.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((challenge) => (
              <tr key={challenge.challengeId}>
                <td>
                  <div className="admin-challenge-player-cell">
                    <span className="admin-challenge-wrestler-name">
                      {challenge.challenger.wrestlerName}
                    </span>
                    <span className="admin-challenge-player-name">
                      {challenge.challenger.playerName}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="admin-challenge-player-cell">
                    <span className="admin-challenge-wrestler-name">
                      {challenge.challenged.wrestlerName}
                    </span>
                    <span className="admin-challenge-player-name">
                      {challenge.challenged.playerName}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="admin-challenge-type-cell">
                    {challenge.matchType}
                    {challenge.stipulation && (
                      <span className="admin-challenge-stip">
                        {challenge.stipulation}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <span className={`challenge-status-badge ${challenge.status}`}>
                    {t(`challenges.status.${challenge.status}`)}
                  </span>
                </td>
                <td>{formatDate(challenge.createdAt)}</td>
                <td>
                  <div className="admin-challenge-actions">
                    {challenge.status === 'accepted' && (
                      <button
                        className="admin-btn-schedule"
                        onClick={() =>
                          navigate('/admin/schedule', {
                            state: {
                              fromChallenge: {
                                challengeId: challenge.challengeId,
                                challengerId: challenge.challengerId,
                                challengedId: challenge.challengedId,
                                matchType: challenge.matchType,
                                stipulation: challenge.stipulation,
                                championshipId: challenge.championshipId,
                                challenger: challenge.challenger,
                                challenged: challenge.challenged,
                              },
                            },
                          })
                        }
                      >
                        {t('challenges.admin.schedule', 'Schedule')}
                      </button>
                    )}
                    {(challenge.status === 'pending' ||
                      challenge.status === 'countered' ||
                      challenge.status === 'accepted') && (
                      <button
                        className="admin-btn-expire"
                        onClick={() => handleCancel(challenge)}
                        disabled={submitting === challenge.challengeId}
                      >
                        {submitting === challenge.challengeId
                          ? 'Cancelling...'
                          : t('challenges.admin.expire')}
                      </button>
                    )}
                    <button
                      className="admin-btn-view-detail"
                      onClick={() =>
                        navigate(`/challenges/${challenge.challengeId}`)
                      }
                    >
                      {t('challenges.my.viewDetails')}
                    </button>
                    <button
                      type="button"
                      className="admin-btn-delete"
                      onClick={() => handleDelete(challenge)}
                      disabled={submitting === challenge.challengeId}
                      title={t('challenges.admin.delete', 'Delete')}
                    >
                      {submitting === challenge.challengeId ? '...' : t('challenges.admin.delete', 'Delete')}
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
