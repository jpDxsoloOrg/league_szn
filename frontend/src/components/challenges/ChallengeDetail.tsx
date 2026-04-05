import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { challengesApi, profileApi, stipulationsApi, matchTypesApi } from '../../services/api';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import type { Stipulation, MatchType } from '../../types';
import type { ChallengeWithPlayers } from '../../types/challenge';
import { getInitial } from './challengeUtils';
import './ChallengeDetail.css';

export default function ChallengeDetail() {
  const { t } = useTranslation();
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();
  const { features } = useSiteConfig();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<ChallengeWithPlayers | null>(null);
  const [counterChallenge, setCounterChallenge] = useState<ChallengeWithPlayers | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Counter form state
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterMatchType, setCounterMatchType] = useState('');
  const [counterStipulation, setCounterStipulation] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setCounterChallenge(null);
    (async () => {
      try {
        const [mainChallenge, myProfile, stips, mTypes] = await Promise.all([
          challengesApi.getById(challengeId!, controller.signal),
          profileApi.getMyProfile(controller.signal),
          stipulationsApi.getAll(controller.signal),
          matchTypesApi.getAll(controller.signal),
        ]);
        setChallenge(mainChallenge);
        setCurrentPlayerId(myProfile.playerId);
        setStipulations(stips);
        setMatchTypes(mTypes);

        if (mainChallenge.counteredChallengeId) {
          const counter = await challengesApi.getById(mainChallenge.counteredChallengeId, controller.signal);
          setCounterChallenge(counter);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to load challenge details:', err);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [challengeId]);

  const handleAction = async (action: string) => {
    if (!challenge) return;
    setSubmitting(true);
    try {
      if (action === 'accept' || action === 'decline') {
        await challengesApi.respond(challenge.challengeId, action as 'accept' | 'decline');
      } else if (action === 'cancel') {
        await challengesApi.cancel(challenge.challengeId);
      } else if (action === 'counter') {
        if (!counterMatchType) return;
        await challengesApi.respond(challenge.challengeId, 'counter', {
          counterMatchType,
          counterStipulation: counterStipulation || undefined,
          counterMessage: counterMessage || undefined,
        });
        setShowCounterForm(false);
      }
      setActionMessage(t('challenges.detail.actionConfirmed', { action }));
      // Refresh
      const updated = await challengesApi.getById(challengeId!);
      setChallenge(updated);
      if (updated.counteredChallengeId) {
        const counter = await challengesApi.getById(updated.counteredChallengeId);
        setCounterChallenge(counter);
      }
      // After accepting, navigate to promo editor for a response promo
      if (action === 'accept' && features.promos && updated) {
        navigate('/promos/new', {
          state: { promoType: 'response', targetPlayerId: updated.challengerId },
        });
      }
    } catch (err) {
      setActionMessage(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setSubmitting(false);
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="challenge-detail">
        <div className="challenge-detail-loading">{t('common.loading')}</div>
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

  const isTagTeam = challenge.challengeMode === 'tag_team';

  const isSent = challenge.challengerId === currentPlayerId ||
    (isTagTeam && !!challenge.challengerTagTeam &&
     (challenge.challengerTagTeam.player1?.playerId === currentPlayerId ||
      challenge.challengerTagTeam.player2?.playerId === currentPlayerId));

  const isReceived = challenge.challengedId === currentPlayerId ||
    (isTagTeam && !!challenge.challengedTagTeam &&
     (challenge.challengedTagTeam.player1?.playerId === currentPlayerId ||
      challenge.challengedTagTeam.player2?.playerId === currentPlayerId));

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
          {isTagTeam && (
            <span className="challenge-detail-tag-team-badge">
              {t('challenges.board.tagTeamMatch')}
            </span>
          )}
        </div>
        <span className={`challenge-status-badge ${challenge.status}`}>
          {t(`challenges.status.${challenge.status}`)}
        </span>
      </div>

      <div className="challenge-detail-versus">
        {isTagTeam && challenge.challengerTagTeam && challenge.challengedTagTeam ? (
          <>
            <div className="challenge-detail-team">
              <div className="challenge-detail-player-avatar challenger">
                {getInitial(challenge.challengerTagTeam.tagTeamName)}
              </div>
              <div className="challenge-detail-team-name">
                {challenge.challengerTagTeam.tagTeamName}
              </div>
              <div className="challenge-detail-team-members">
                <div className="challenge-detail-team-member">
                  {challenge.challengerTagTeam.player1.wrestlerName}
                  <span className="challenge-detail-team-member-player">
                    {challenge.challengerTagTeam.player1.playerName}
                  </span>
                </div>
                <div className="challenge-detail-team-member">
                  {challenge.challengerTagTeam.player2.wrestlerName}
                  <span className="challenge-detail-team-member-player">
                    {challenge.challengerTagTeam.player2.playerName}
                  </span>
                </div>
              </div>
              <span className="challenge-detail-role-label challenger-label">
                {t('challenges.detail.challengerTeam')}
              </span>
            </div>

            <div className="challenge-detail-vs">{t('common.vs').toUpperCase()}</div>

            <div className="challenge-detail-team">
              <div className="challenge-detail-player-avatar challenged">
                {getInitial(challenge.challengedTagTeam.tagTeamName)}
              </div>
              <div className="challenge-detail-team-name">
                {challenge.challengedTagTeam.tagTeamName}
              </div>
              <div className="challenge-detail-team-members">
                <div className="challenge-detail-team-member">
                  {challenge.challengedTagTeam.player1.wrestlerName}
                  <span className="challenge-detail-team-member-player">
                    {challenge.challengedTagTeam.player1.playerName}
                  </span>
                </div>
                <div className="challenge-detail-team-member">
                  {challenge.challengedTagTeam.player2.wrestlerName}
                  <span className="challenge-detail-team-member-player">
                    {challenge.challengedTagTeam.player2.playerName}
                  </span>
                </div>
              </div>
              <span className="challenge-detail-role-label challenged-label">
                {t('challenges.detail.challengedTeam')}
              </span>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="challenge-detail-messages">
        <h3>{t('challenges.detail.messages')}</h3>
        {(challenge.challengeNote || challenge.message) && (
          <div className="challenge-message-block from-challenger">
            <div className="challenge-message-sender">
              {challenge.challenger.wrestlerName} ({challenge.challenger.playerName})
            </div>
            <div className="challenge-message-text">
              &ldquo;{challenge.challengeNote || challenge.message}&rdquo;
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

      {challenge.opponents && challenge.opponents.length > 1 && (
        <div className="challenge-detail-opponent-responses">
          <h3>{t('challenges.detail.opponentResponses', 'Opponent Responses')}</h3>
          <ul>
            {challenge.opponents.map((op) => {
              const pid = op.playerId;
              const resp = pid ? challenge.responses?.[pid] : undefined;
              const status = resp?.status || 'pending';
              return (
                <li key={pid || op.wrestlerName}>
                  <strong>{op.wrestlerName}</strong>
                  {' — '}
                  <span className={`challenge-status-badge ${status}`}>
                    {t(`challenges.status.${status}`)}
                  </span>
                  {resp?.declineReason && (
                    <div className="challenge-decline-reason">&ldquo;{resp.declineReason}&rdquo;</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
          className={`challenge-action-message ${
            actionMessage.startsWith('Error')
              ? 'challenge-action-message-error'
              : 'challenge-action-message-success'
          }`}
        >
          {actionMessage}
        </div>
      )}

      {isReceived && challenge.status === 'pending' && (
        <>
          <div className="challenge-detail-actions">
            <button className="btn-accept" disabled={submitting} onClick={() => handleAction('accept')}>
              {t('challenges.detail.accept')}
            </button>
            <button className="btn-decline" disabled={submitting} onClick={() => handleAction('decline')}>
              {t('challenges.detail.decline')}
            </button>
            <button
              className="btn-counter"
              disabled={submitting}
              onClick={() => setShowCounterForm(!showCounterForm)}
            >
              {t('challenges.detail.counter')}
            </button>
          </div>

          {showCounterForm && (
            <div className="challenge-counter-form">
              <h3>
                {t('challenges.detail.counterChallenge')}
              </h3>

              <div className="challenge-counter-form-group">
                <label className="challenge-counter-form-label">
                  {t('challenges.issue.matchType')} *
                </label>
                <select
                  className="challenge-counter-form-select"
                  value={counterMatchType}
                  onChange={(e) => setCounterMatchType(e.target.value)}
                >
                  <option value="">{t('challenges.issue.selectMatchType')}</option>
                  {matchTypes.map((mt) => (
                    <option key={mt.matchTypeId} value={mt.name}>{mt.name}</option>
                  ))}
                </select>
              </div>

              <div className="challenge-counter-form-group">
                <label className="challenge-counter-form-label">
                  {t('challenges.issue.stipulation')}
                </label>
                <select
                  className="challenge-counter-form-select"
                  value={counterStipulation}
                  onChange={(e) => setCounterStipulation(e.target.value)}
                >
                  <option value="">{t('common.none', 'None')}</option>
                  {stipulations.map((s) => (
                    <option key={s.stipulationId} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="challenge-counter-form-group">
                <label className="challenge-counter-form-label">
                  {t('challenges.issue.message')}
                </label>
                <textarea
                  className="challenge-counter-form-textarea"
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                  placeholder={t('challenges.issue.messagePlaceholder')}
                  rows={3}
                  maxLength={500}
                />
              </div>

              <div className="challenge-counter-form-actions">
                <button
                  className="challenge-counter-form-submit"
                  disabled={!counterMatchType || submitting}
                  onClick={() => handleAction('counter')}
                >
                  {submitting ? t('common.submitting') : t('challenges.issue.submit')}
                </button>
                <button
                  className="challenge-counter-form-cancel"
                  onClick={() => setShowCounterForm(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </>
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
                <div className="challenge-counter-link-subtext">
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
        <Link to={`/events`} className="challenge-match-link">
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
