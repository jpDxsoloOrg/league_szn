import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { mockChallenges } from '../../mocks/challengeMockData';
import type { ChallengeWithPlayers } from '../../types/challenge';
import './ChallengeBoard.css';

type FilterTab = 'active' | 'pending' | 'accepted' | 'recent';

function getDaysRemaining(expiresAt: string): number {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

export default function ChallengeBoard() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('active');

  const filtered = useMemo(() => {
    switch (activeFilter) {
      case 'active':
        return mockChallenges.filter((c) =>
          ['pending', 'accepted', 'countered', 'scheduled'].includes(c.status)
        );
      case 'pending':
        return mockChallenges.filter((c) => c.status === 'pending');
      case 'accepted':
        return mockChallenges.filter((c) =>
          ['accepted', 'scheduled'].includes(c.status)
        );
      case 'recent':
        return mockChallenges.filter((c) =>
          ['declined', 'expired', 'cancelled'].includes(c.status)
        );
      default:
        return mockChallenges;
    }
  }, [activeFilter]);

  const renderCountdown = (challenge: ChallengeWithPlayers) => {
    if (challenge.status !== 'pending') return null;
    const days = getDaysRemaining(challenge.expiresAt);
    const isUrgent = days <= 1;
    return (
      <span className={`challenge-countdown ${isUrgent ? 'urgent' : ''}`}>
        {days} {t('common.days')} {t('challenges.board.remaining')}
      </span>
    );
  };

  const renderDate = (challenge: ChallengeWithPlayers) => {
    const date = new Date(challenge.createdAt);
    return date.toLocaleDateString();
  };

  return (
    <div className="challenge-board">
      <div className="challenge-board-header">
        <h2>{t('challenges.board.title')}</h2>
        <div className="challenge-board-actions">
          <Link to="/challenges/my" className="btn-my">
            {t('challenges.board.myChallenges')}
          </Link>
          <Link to="/challenges/issue" className="btn-issue">
            + {t('challenges.board.issueChallenge')}
          </Link>
        </div>
      </div>

      <div className="challenge-filter-tabs">
        <button
          className={activeFilter === 'active' ? 'active' : ''}
          onClick={() => setActiveFilter('active')}
        >
          {t('challenges.board.filterActive')}
        </button>
        <button
          className={activeFilter === 'pending' ? 'active' : ''}
          onClick={() => setActiveFilter('pending')}
        >
          {t('challenges.board.filterPending')}
        </button>
        <button
          className={activeFilter === 'accepted' ? 'active' : ''}
          onClick={() => setActiveFilter('accepted')}
        >
          {t('challenges.board.filterAccepted')}
        </button>
        <button
          className={activeFilter === 'recent' ? 'active' : ''}
          onClick={() => setActiveFilter('recent')}
        >
          {t('challenges.board.filterRecent')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="challenge-board-empty">
          <p>{t('challenges.board.noChallenges')}</p>
          <Link to="/challenges/issue" className="btn-issue">
            {t('challenges.board.issueChallenge')}
          </Link>
        </div>
      ) : (
        <div className="challenge-grid">
          {filtered.map((challenge) => (
            <Link
              to={`/challenges/${challenge.challengeId}`}
              key={challenge.challengeId}
              className="challenge-card"
            >
              <div className="challenge-card-top">
                <div>
                  <span className="challenge-matchtype">
                    {challenge.matchType}
                  </span>
                  {challenge.stipulation && (
                    <span className="challenge-stipulation">
                      {challenge.stipulation}
                    </span>
                  )}
                </div>
                <span
                  className={`challenge-status-badge ${challenge.status}`}
                >
                  {t(`challenges.status.${challenge.status}`)}
                </span>
              </div>

              <div className="challenge-versus">
                <div className="challenge-player">
                  <div className="challenge-player-avatar">
                    {getInitial(challenge.challenger.wrestlerName)}
                  </div>
                  <div className="challenge-wrestler-name">
                    {challenge.challenger.wrestlerName}
                  </div>
                  <div className="challenge-player-name">
                    {challenge.challenger.playerName}
                  </div>
                </div>
                <span className="challenge-vs-divider">
                  {t('common.vs').toUpperCase()}
                </span>
                <div className="challenge-player">
                  <div className="challenge-player-avatar">
                    {getInitial(challenge.challenged.wrestlerName)}
                  </div>
                  <div className="challenge-wrestler-name">
                    {challenge.challenged.wrestlerName}
                  </div>
                  <div className="challenge-player-name">
                    {challenge.challenged.playerName}
                  </div>
                </div>
              </div>

              {challenge.message && (
                <div className="challenge-card-message">
                  &ldquo;{challenge.message}&rdquo;
                </div>
              )}

              <div className="challenge-card-footer">
                {renderCountdown(challenge) || (
                  <span>{renderDate(challenge)}</span>
                )}
                {challenge.championshipId && (
                  <span className="challenge-championship-badge">
                    {t('challenges.board.titleMatch')}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
