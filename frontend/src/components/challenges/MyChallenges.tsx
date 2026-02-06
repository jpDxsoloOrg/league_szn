import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { mockChallenges, mockCurrentPlayerId } from '../../mocks/challengeMockData';
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

  const sentChallenges = useMemo(
    () => mockChallenges.filter((c) => c.challengerId === mockCurrentPlayerId),
    []
  );

  const receivedChallenges = useMemo(
    () => mockChallenges.filter((c) => c.challengedId === mockCurrentPlayerId),
    []
  );

  const currentList = activeTab === 'sent' ? sentChallenges : receivedChallenges;

  const handleAction = (action: string, challenge: ChallengeWithPlayers) => {
    const opponent =
      challenge.challengerId === mockCurrentPlayerId
        ? challenge.challenged.wrestlerName
        : challenge.challenger.wrestlerName;
    setActionFeedback(
      t('challenges.my.actionFeedback', { action, opponent })
    );
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const getOpponent = (challenge: ChallengeWithPlayers) => {
    if (challenge.challengerId === mockCurrentPlayerId) {
      return challenge.challenged;
    }
    return challenge.challenger;
  };

  const renderChallengeItem = (challenge: ChallengeWithPlayers) => {
    const opponent = getOpponent(challenge);
    const isSent = challenge.challengerId === mockCurrentPlayerId;
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
                  onClick={() => handleAction(t('challenges.detail.accept'), challenge)}
                >
                  {t('challenges.detail.accept')}
                </button>
                <button
                  className="btn-sm-decline"
                  onClick={() => handleAction(t('challenges.detail.decline'), challenge)}
                >
                  {t('challenges.detail.decline')}
                </button>
                <button
                  className="btn-sm-counter"
                  onClick={() => handleAction(t('challenges.detail.counter'), challenge)}
                >
                  {t('challenges.detail.counter')}
                </button>
              </>
            )}
            {isSent && challenge.status === 'pending' && (
              <button
                className="btn-sm-cancel"
                onClick={() => handleAction(t('challenges.detail.cancel'), challenge)}
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
