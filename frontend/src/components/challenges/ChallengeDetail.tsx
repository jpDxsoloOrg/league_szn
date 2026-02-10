import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { challengesApi, profileApi } from '../../services/api';
import type { ChallengeWithPlayers } from '../../types/challenge';
import './ChallengeDetail.css';

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

export default function ChallengeDetail() {
  const { t } = useTranslation();
  const { challengeId } = useParams<{ challengeId: string }>();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<ChallengeWithPlayers | null>(null);
  const [allChallenges, setAllChallenges] = useState<ChallengeWithPlayers[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      challengesApi.getAll(undefined, controller.signal),
      profileApi.getMyProfile(controller.signal),
    ])
      .then(([challenges, myProfile]) => {
        setAllChallenges(challenges);
        const found = challenges.find((c: ChallengeWithPlayers) => c.challengeId === challengeId);
        setChallenge(found || null);
        setCurrentPlayerId(myProfile.playerId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [challengeId]);

  const handleAction = async (action: string) => {
    if (!challenge) return;
    try {
      if (action === 'accept' || action === 'decline') {
        await challengesApi.respond(challenge.challengeId, action as 'accept' | 'decline');
      } else if (action === 'cancel') {
        await challengesApi.cancel(challenge.challengeId);
      }
      setActionMessage(t('challenges.detail.actionConfirmed', { action }));
      // Refresh
      const updated = await challengesApi.getAll();
      setAllChallenges(updated);
      setChallenge(updated.find((c: ChallengeWithPlayers) => c.challengeId === challengeId) || null);
    } catch (err) {
      setActionMessage(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="challenge-detail">
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Loading...</div>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="challenge-detail">
        <Link to="/challenges" className="challenge-detail-back">
          &larr; {t('challenges.detail.backToBoard')}
        </Link>
        <div className="challenge-not-found">
          <p>{t('challenges.detail.notFound')}</p>
          <Link to="/challenges" className="btn-issue">
            {t('challenges.detail.backToBoard')}
          </Link>
        </div>
      </div>
    );
  }

  const isReceived = challenge.challengedId === currentPlayerId;
  const isSent = challenge.challengerId === currentPlayerId;

  const counterChallenge = challenge.counteredChallengeId
    ? allChallenges.find((c) => c.challengeId === challenge.counteredChallengeId)
    : null;

  const createdDate = new Date(challenge.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const expiresDate = new Date(challenge.expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="challenge-detail">
      <Link to="/challenges" className="challenge-detail-back">
        &larr; {t('challenges.detail.backToBoard')}
      </Link>

      <div className="challenge-detail-header">
        <div className="challenge-detail-meta">
          <span className="challenge-detail-matchtype">{challenge.matchType}</span>
          {challenge.stipulation && (
            <span className="challenge-detail-stipulation">{challenge.stipulation}</span>
          )}
          {challenge.championshipId && (
            <span className="challenge-detail-championship">
              {t('challenges.board.titleMatch')}
            </span>
          )}
        </div>
        <span className={`challenge-status-badge ${challenge.status}`}>
          {t(`challenges.status.${challenge.status}`)}
        </span>
      </div>

      <div className="challenge-detail-versus">
        <div className="challenge-detail-player">
          <div className="challenge-detail-player-avatar challenger">
            {getInitial(challenge.challenger.wrestlerName)}
          </div>
          <div className="challenge-detail-wrestler">
            {challenge.challenger.wrestlerName}
          </div>
          <div className="challenge-detail-player-label">
            {challenge.challenger.playerName}
          </div>
          <span className="challenge-detail-role-label challenger-label">
            {t('challenges.detail.challenger')}
          </span>
        </div>

        <div className="challenge-detail-vs">{t('common.vs').toUpperCase()}</div>

        <div className="challenge-detail-player">
          <div className="challenge-detail-player-avatar challenged">
            {getInitial(challenge.challenged.wrestlerName)}
          </div>
          <div className="challenge-detail-wrestler">
            {challenge.challenged.wrestlerName}
          </div>
          <div className="challenge-detail-player-label">
            {challenge.challenged.playerName}
          </div>
          <span className="challenge-detail-role-label challenged-label">
            {t('challenges.detail.challenged')}
          </span>
        </div>
      </div>

      <div className="challenge-detail-messages">
        <h3>{t('challenges.detail.messages')}</h3>
        {challenge.message && (
          <div className="challenge-message-block from-challenger">
            <div className="challenge-message-sender">
              {challenge.challenger.wrestlerName} ({challenge.challenger.playerName})
            </div>
            <div className="challenge-message-text">
              &ldquo;{challenge.message}&rdquo;
            </div>
          </div>
        )}
        {challenge.responseMessage && (
          <div className="challenge-message-block from-challenged">
            <div className="challenge-message-sender">
              {challenge.challenged.wrestlerName} ({challenge.challenged.playerName})
            </div>
            <div className="challenge-message-text">
              &ldquo;{challenge.responseMessage}&rdquo;
            </div>
          </div>
        )}
      </div>

      <div className="challenge-detail-info">
        <div className="challenge-info-item">
          <div className="challenge-info-label">{t('challenges.detail.status')}</div>
          <div className="challenge-info-value">
            {t(`challenges.status.${challenge.status}`)}
          </div>
        </div>
        <div className="challenge-info-item">
          <div className="challenge-info-label">{t('challenges.detail.created')}</div>
          <div className="challenge-info-value">{createdDate}</div>
        </div>
        <div className="challenge-info-item">
          <div className="challenge-info-label">{t('challenges.detail.expires')}</div>
          <div className="challenge-info-value">{expiresDate}</div>
        </div>
        <div className="challenge-info-item">
          <div className="challenge-info-label">{t('challenges.detail.matchType')}</div>
          <div className="challenge-info-value">
            {challenge.matchType}
            {challenge.stipulation ? ` - ${challenge.stipulation}` : ''}
          </div>
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            backgroundColor: 'rgba(74, 222, 128, 0.15)',
            color: '#4ade80',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            textAlign: 'center',
            fontWeight: 500,
          }}
        >
          {actionMessage}
        </div>
      )}

      {isReceived && challenge.status === 'pending' && (
        <div className="challenge-detail-actions">
          <button className="btn-accept" onClick={() => handleAction('accept')}>
            {t('challenges.detail.accept')}
          </button>
          <button className="btn-decline" onClick={() => handleAction('decline')}>
            {t('challenges.detail.decline')}
          </button>
          <button className="btn-counter" onClick={() => handleAction('counter')}>
            {t('challenges.detail.counter')}
          </button>
        </div>
      )}

      {isSent && challenge.status === 'pending' && (
        <div className="challenge-detail-actions">
          <button
            className="btn-cancel-challenge"
            onClick={() => handleAction('cancel')}
          >
            {t('challenges.detail.cancel')}
          </button>
        </div>
      )}

      {counterChallenge && (
        <div className="challenge-counter-chain">
          <h3>{t('challenges.detail.counterChallenge')}</h3>
          <Link
            to={`/challenges/${counterChallenge.challengeId}`}
            className="challenge-counter-link"
          >
            <div className="challenge-counter-link-info">
              <div>
                <div className="challenge-counter-link-text">
                  {counterChallenge.challenger.wrestlerName} {t('common.vs')}{' '}
                  {counterChallenge.challenged.wrestlerName}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>
                  {counterChallenge.matchType}
                  {counterChallenge.stipulation
                    ? ` - ${counterChallenge.stipulation}`
                    : ''}
                </div>
              </div>
              <span className="challenge-counter-link-arrow">&rarr;</span>
            </div>
          </Link>
        </div>
      )}

      {challenge.matchId && (
        <Link to={`/matches`} className="challenge-match-link">
          <div className="challenge-match-link-info">
            <span className="challenge-match-link-text">
              {t('challenges.detail.viewScheduledMatch')}
            </span>
            <span>&rarr;</span>
          </div>
        </Link>
      )}
    </div>
  );
}
