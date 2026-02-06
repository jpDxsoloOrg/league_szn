import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { mockChallenges } from '../../mocks/challengeMockData';
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
  const [statusFilter, setStatusFilter] = useState<ChallengeStatus | 'all'>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return mockChallenges;
    return mockChallenges.filter((c) => c.status === statusFilter);
  }, [statusFilter]);

  const handleSchedule = (challenge: ChallengeWithPlayers) => {
    setFeedback(
      `${t('challenges.admin.schedule')}: ${challenge.challenger.wrestlerName} vs ${challenge.challenged.wrestlerName}`
    );
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleExpire = (challenge: ChallengeWithPlayers) => {
    setFeedback(
      `${t('challenges.admin.expire')}: ${challenge.challenger.wrestlerName} vs ${challenge.challenged.wrestlerName}`
    );
    setTimeout(() => setFeedback(null), 3000);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

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
      </div>

      {feedback && <div className="admin-challenge-feedback">{feedback}</div>}

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
                        onClick={() => handleSchedule(challenge)}
                      >
                        {t('challenges.admin.schedule')}
                      </button>
                    )}
                    {(challenge.status === 'pending' ||
                      challenge.status === 'countered') && (
                      <button
                        className="admin-btn-expire"
                        onClick={() => handleExpire(challenge)}
                      >
                        {t('challenges.admin.expire')}
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
