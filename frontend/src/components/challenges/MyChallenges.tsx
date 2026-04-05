import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { challengesApi, profileApi } from '../../services/api';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import type { ChallengeWithPlayers } from '../../types/challenge';
import { getInitial } from './challengeUtils';
import './MyChallenges.css';

type MyTab = 'sent' | 'received';

export default function MyChallenges() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { features } = useSiteConfig();
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
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Failed to load challenges:', err);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const sentChallenges = useMemo(
    () => challenges.filter((c) =>
      c.challengerId === currentPlayerId ||
      (c.challengeMode === 'tag_team' && c.challengerTagTeam &&
       (c.challengerTagTeam.player1?.playerId === currentPlayerId ||
        c.challengerTagTeam.player2?.playerId === currentPlayerId))
    ),
    [challenges, currentPlayerId]
  );

  const receivedChallenges = useMemo(
    () => challenges.filter((c) =>
      c.challengedId === currentPlayerId ||
      (c.challengeMode === 'tag_team' && c.challengedTagTeam &&
       (c.challengedTagTeam.player1?.playerId === currentPlayerId ||
        c.challengedTagTeam.player2?.playerId === currentPlayerId))
    ),
    [challenges, currentPlayerId]
  );

  const currentList = activeTab === 'sent' ? sentChallenges : receivedChallenges;

  const isSentByMe = useCallback((challenge: ChallengeWithPlayers): boolean => {
    if (challenge.challengerId === currentPlayerId) return true;
    if (challenge.challengeMode === 'tag_team' && challenge.challengerTagTeam) {
      return challenge.challengerTagTeam.player1?.playerId === currentPlayerId ||
        challenge.challengerTagTeam.player2?.playerId === currentPlayerId;
    }
    return false;
  }, [currentPlayerId]);

  const handleAction = useCallback(async (action: string, challenge: ChallengeWithPlayers) => {
    try {
      if (action === 'accept' || action === 'decline') {
        await challengesApi.respond(challenge.challengeId, action as 'accept' | 'decline');
      } else if (action === 'cancel') {
        await challengesApi.cancel(challenge.challengeId);
      }
      let opponent: string;
      if (challenge.challengeMode === 'tag_team') {
        opponent = isSentByMe(challenge)
          ? (challenge.challengedTagTeam?.tagTeamName ?? challenge.challenged.wrestlerName)
          : (challenge.challengerTagTeam?.tagTeamName ?? challenge.challenger.wrestlerName);
      } else {
        opponent = isSentByMe(challenge)
          ? challenge.challenged.wrestlerName
          : challenge.challenger.wrestlerName;
      }
      setActionFeedback(
        t('challenges.my.actionFeedback', { action, opponent })
      );
      // Refresh challenges
      const updated = await challengesApi.getAll();
      setChallenges(updated);

      // After accepting, navigate to promo editor for a response promo
      if (action === 'accept' && features.promos) {
        navigate('/promos/new', {
          state: { promoType: 'response', targetPlayerId: challenge.challengerId },
        });
      }
    } catch (err) {
      setActionFeedback(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    }
    setTimeout(() => setActionFeedback(null), 3000);
  }, [isSentByMe, t, features, navigate]);

  const getOpponent = (challenge: ChallengeWithPlayers) => {
    if (challenge.challengerId === currentPlayerId) {
      return challenge.challenged;
    }
    return challenge.challenger;
  };

  const renderChallengeItem = (challenge: ChallengeWithPlayers) => {
    const opponent = getOpponent(challenge);
    const isSent = isSentByMe(challenge);
    const isTagTeam = challenge.challengeMode === 'tag_team';
    const opponentTagTeam = isTagTeam
      ? (isSent ? challenge.challengedTagTeam : challenge.challengerTagTeam)
      : undefined;
    const date = new Date(challenge.createdAt).toLocaleDateString();

    return (
      <div key={challenge.challengeId} className="my-challenge-item">
        <div className="my-challenge-item-top">
          <div className="my-challenge-opponent">
            {isTagTeam && opponentTagTeam ? (
              <>
                <div className="my-challenge-opponent-avatar">
                  {getInitial(opponentTagTeam.tagTeamName)}
                </div>
                <div className="my-challenge-opponent-info">
                  <span className="my-challenge-opponent-wrestler">
                    {opponentTagTeam.tagTeamName}
                  </span>
                  <span className="my-challenge-opponent-name">
                    {opponentTagTeam.player1.wrestlerName} &amp; {opponentTagTeam.player2.wrestlerName}
                  </span>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
          <div className="my-challenge-meta">
            {isTagTeam && (
              <span className="my-challenge-type-tag my-challenge-tag-team-badge">
                {t('challenges.board.tagTeamMatch')}
              </span>
            )}
            <span className="my-challenge-type-tag">{challenge.matchType}</span>
            {challenge.stipulation && (
              <span className="my-challenge-type-tag">{challenge.stipulation}</span>
            )}
            <span className={`challenge-status-badge ${challenge.status}`}>
              {t(`challenges.status.${challenge.status}`)}
            </span>
          </div>
        </div>

        {(challenge.challengeNote || challenge.message) && (
          <div className="my-challenge-message">
            &ldquo;{challenge.challengeNote || challenge.message}&rdquo;
          </div>
        )}

        {challenge.opponents && challenge.opponents.length > 1 && challenge.responses && (
          <div className="my-challenge-responses">
            <strong>{t('challenges.my.opponentResponses', 'Opponent Responses')}:</strong>
            <ul>
              {challenge.opponents.map((op) => {
                const pid = op.playerId;
                const resp = pid ? challenge.responses?.[pid] : undefined;
                const status = resp?.status || 'pending';
                return (
                  <li key={pid || op.wrestlerName}>
                    <span>{op.wrestlerName}</span>{' '}
                    <span className={`challenge-status-badge ${status}`}>{t(`challenges.status.${status}`)}</span>
                    {resp?.declineReason && (
                      <div className="my-challenge-decline-reason">&ldquo;{resp.declineReason}&rdquo;</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {challenge.status === 'auto_scheduled' && challenge.matchId && (
          <div className="my-challenge-scheduled">
            <span className="challenge-status-badge auto_scheduled">
              {t('challenges.status.auto_scheduled', 'Scheduled ✓')}
            </span>
            <Link to={`/matches?status=scheduled`} className="my-challenge-scheduled-link">
              {t('challenges.my.viewScheduledMatch', 'View match')} &rarr;
            </Link>
          </div>
        )}

        {challenge.responseMessage && (
          <div className="my-challenge-message">
            <strong className="my-challenge-response-label">
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
        <div className="my-challenges-loading">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="my-challenges">
      <div className="my-challenges-header">
        <h2>{t('challenges.my.title')}</h2>
        <Link
          to="/promos/new?promoType=call-out"
          className="my-challenges-issue-link"
        >
          + {t('promos.editor.cutCallOut', 'Cut a Call-Out Promo')}
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
              to="/promos/new?promoType=call-out"
              className="my-challenges-empty-issue-link"
            >
              {t('promos.editor.cutCallOut', 'Cut a Call-Out Promo')}
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
