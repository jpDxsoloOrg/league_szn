import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { challengesApi, profileApi } from '../../services/api';
import type { ChallengeWithPlayers } from '../../types/challenge';
import './MyChallenges.css';

type MyTab = 'sent' | 'received';

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

export default function MyChallenges() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<MyTab>('received');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<ChallengeWithPlayers[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    // Use profileApi to reliably identify current player via backend auth
    Promise.all([
      profileApi.getMyProfile(controller.signal),
      challengesApi.getAll(undefined, controller.signal),
    ])
      .then(([myProfile, allChallenges]) => {
        setChallenges(allChallenges);
        setCurrentPlayerId(myProfile.playerId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const sentChallenges = useMemo(
    () => challenges.filter((c) => c.challengerId === currentPlayerId),
    [challenges, currentPlayerId]
  );

  const receivedChallenges = useMemo(
    () => challenges.filter((c) => c.challengedId === currentPlayerId),
    [challenges, currentPlayerId]
  );

  const currentList = activeTab === 'sent' ? sentChallenges : receivedChallenges;

  const handleAction = useCallback(async (action: string, challenge: ChallengeWithPlayers) => {
    try {
      if (action === 'accept' || action === 'decline') {
        await challengesApi.respond(challenge.challengeId, action as 'accept' | 'decline');
      } else if (action === 'cancel') {
        await challengesApi.cancel(challenge.challengeId);
      }
      const opponent =
        challenge.challengerId === currentPlayerId
          ? challenge.challenged.wrestlerName
          : challenge.challenger.wrestlerName;
      setActionFeedback(
        t('challenges.my.actionFeedback', { action, opponent })
      );
      // Refresh challenges
      const updated = await challengesApi.getAll();
      setChallenges(updated);
    } catch (err) {
      setActionFeedback(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    }
    setTimeout(() => setActionFeedback(null), 3000);
  }, [currentPlayerId, t]);

  const getOpponent = (challenge: ChallengeWithPlayers) => {
    if (challenge.challengerId === currentPlayerId) {
      return challenge.challenged;
    }
    return challenge.challenger;
  };

  const renderChallengeItem = (challenge: ChallengeWithPlayers) => {
    const opponent = getOpponent(challenge);
    const isSent = challenge.challengerId === currentPlayerId;
    const date = new Date(challenge.createdAt).toLocaleDateString();

    return (
      <div key={challenge.challengeId} className="my-challenge-item">
        <div className="my-challenge-item-top">
          <div className="my-challenge-opponent">
            <div className="my-challenge-opponent-avatar">
              {getInitial(opponent.wrestlerName)}
            </div>
            <div className="my-challenge-opponent-info">
              <span className="my-challenge-opponent-wrestler">
                {opponent.wrestlerName}
              </span>
              <span className="my-challenge-opponent-name">
                {opponent.playerName}
              </span>
            </div>
          </div>
          <div className="my-challenge-meta">
            <span className="my-challenge-type-tag">{challenge.matchType}</span>
            {challenge.stipulation && (
              <span className="my-challenge-type-tag">{challenge.stipulation}</span>
            )}
            <span className={`challenge-status-badge ${challenge.status}`}>
              {t(`challenges.status.${challenge.status}`)}
            </span>
          </div>
        </div>

        {challenge.message && (
          <div className="my-challenge-message">
            &ldquo;{challenge.message}&rdquo;
          </div>
        )}

        {challenge.responseMessage && (
          <div className="my-challenge-message">
            <strong style={{ fontStyle: 'normal', color: '#bbb' }}>
              {t('challenges.my.response')}:
            </strong>{' '}
            &ldquo;{challenge.responseMessage}&rdquo;
          </div>
        )}

        <div className="my-challenge-footer">
          <span className="my-challenge-date">{date}</span>
          <div className="my-challenge-actions">
            {!isSent && challenge.status === 'pending' && (
              <>
                <button
                  className="btn-sm-accept"
                  onClick={() => handleAction('accept', challenge)}
                >
                  {t('challenges.detail.accept')}
                </button>
                <button
                  className="btn-sm-decline"
                  onClick={() => handleAction('decline', challenge)}
                >
                  {t('challenges.detail.decline')}
                </button>
                <button
                  className="btn-sm-counter"
                  onClick={() => navigate(`/challenges/${challenge.challengeId}`)}
                >
                  {t('challenges.detail.counter')}
                </button>
              </>
            )}
            {isSent && challenge.status === 'pending' && (
              <button
                className="btn-sm-cancel"
                onClick={() => handleAction('cancel', challenge)}
              >
                {t('common.cancel')}
              </button>
            )}
            <button
              className="btn-sm-view"
              onClick={() => navigate(`/challenges/${challenge.challengeId}`)}
            >
              {t('challenges.my.viewDetails')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="my-challenges">
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="my-challenges">
      <Link to="/challenges" className="my-challenges-back">
        &larr; {t('challenges.detail.backToBoard')}
      </Link>

      <div className="my-challenges-header">
        <h2>{t('challenges.my.title')}</h2>
        <Link
          to="/challenges/issue"
          style={{
            backgroundColor: '#d4af37',
            color: '#000',
            padding: '0.6rem 1.2rem',
            borderRadius: '4px',
            textDecoration: 'none',
            fontWeight: 'bold',
            fontSize: '0.95rem',
          }}
        >
          + {t('challenges.board.issueChallenge')}
        </Link>
      </div>

      <div className="my-challenges-tabs">
        <button
          className={activeTab === 'received' ? 'active' : ''}
          onClick={() => setActiveTab('received')}
        >
          {t('challenges.my.received')}
          <span className="my-challenges-tab-count">{receivedChallenges.length}</span>
        </button>
        <button
          className={activeTab === 'sent' ? 'active' : ''}
          onClick={() => setActiveTab('sent')}
        >
          {t('challenges.my.sent')}
          <span className="my-challenges-tab-count">{sentChallenges.length}</span>
        </button>
      </div>

      {actionFeedback && (
        <div className="my-challenge-action-feedback">{actionFeedback}</div>
      )}

      {currentList.length === 0 ? (
        <div className="my-challenges-empty">
          <p>
            {activeTab === 'sent'
              ? t('challenges.my.noSent')
              : t('challenges.my.noReceived')}
          </p>
          {activeTab === 'sent' && (
            <Link
              to="/challenges/issue"
              style={{
                backgroundColor: '#d4af37',
                color: '#000',
                padding: '0.6rem 1.2rem',
                borderRadius: '4px',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              {t('challenges.board.issueChallenge')}
            </Link>
          )}
        </div>
      ) : (
        <div className="my-challenges-list">
          {currentList.map(renderChallengeItem)}
        </div>
      )}
    </div>
  );
}
