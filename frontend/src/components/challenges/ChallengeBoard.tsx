import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { challengesApi } from '../../services/api';
import type { ChallengeWithPlayers } from '../../types/challenge';
import { getInitial } from './challengeUtils';
import './ChallengeBoard.css';

type FilterTab = 'active' | 'pending' | 'accepted' | 'recent';

function getDaysRemaining(expiresAt: string): number {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function ChallengeBoard() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('active');
  const [challenges, setChallenges] = useState<ChallengeWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    challengesApi
      .getAll(undefined, controller.signal)
      .then((data) => {
        // Public board: only show pending, countered, accepted (hide scheduled, expired, cancelled)
        const visible = data.filter((c) =>
          ['pending', 'countered', 'accepted'].includes(c.status)
        );
        setChallenges(visible);
        setError(null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    switch (activeFilter) {
      case 'active':
        return challenges.filter((c) =>
          ['pending', 'accepted', 'countered'].includes(c.status)
        );
      case 'pending':
        return challenges.filter((c) => c.status === 'pending');
      case 'accepted':
        return challenges.filter((c) => c.status === 'accepted');
      case 'recent':
        return challenges.filter((c) => c.status === 'declined');
      default:
        return challenges;
    }
  }, [activeFilter, challenges]);

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

  if (loading) {
    return (
      <div className="challenge-board">
        <div className="challenge-board-header">
          <h2>{t('challenges.board.title')}</h2>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Loading challenges...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="challenge-board">
        <div className="challenge-board-header">
          <h2>{t('challenges.board.title')}</h2>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="challenge-board">
      <div className="challenge-board-header">
        <h2>{t('challenges.board.title')}</h2>
        <div className="challenge-board-actions">
          <Link to="/challenges/my" className="btn-my">
            {t('challenges.board.myChallenges')}
          </Link>
          <Link to="/promos/new?promoType=call-out" className="btn-issue">
            + {t('promos.editor.cutCallOut', 'Cut a Call-Out Promo')}
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
          <Link to="/promos/new?promoType=call-out" className="btn-issue">
            {t('promos.editor.cutCallOut', 'Cut a Call-Out Promo')}
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

              {challenge.challengeMode === 'tag_team' && (
                <span className="challenge-tag-team-badge">
                  {t('challenges.board.tagTeamMatch')}
                </span>
              )}

              <div className="challenge-versus">
                {challenge.challengeMode === 'tag_team' && challenge.challengerTagTeam ? (
                  <>
                    <div className="challenge-player">
                      <div className="challenge-player-avatar">
                        {getInitial(challenge.challengerTagTeam.tagTeamName)}
                      </div>
                      <div className="challenge-wrestler-name">
                        {challenge.challengerTagTeam.tagTeamName}
                      </div>
                      <div className="challenge-team-members">
                        {challenge.challengerTagTeam.player1.wrestlerName} &amp; {challenge.challengerTagTeam.player2.wrestlerName}
                      </div>
                    </div>
                    <span className="challenge-vs-divider">
                      {t('common.vs').toUpperCase()}
                    </span>
                    <div className="challenge-player">
                      <div className="challenge-player-avatar">
                        {getInitial(challenge.challengedTagTeam?.tagTeamName ?? challenge.challenged.wrestlerName)}
                      </div>
                      <div className="challenge-wrestler-name">
                        {challenge.challengedTagTeam?.tagTeamName ?? challenge.challenged.wrestlerName}
                      </div>
                      {challenge.challengedTagTeam ? (
                        <div className="challenge-team-members">
                          {challenge.challengedTagTeam.player1.wrestlerName} &amp; {challenge.challengedTagTeam.player2.wrestlerName}
                        </div>
                      ) : (
                        <div className="challenge-player-name">
                          {challenge.challenged.playerName}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
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
