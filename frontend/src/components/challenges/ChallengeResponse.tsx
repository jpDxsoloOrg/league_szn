import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { challengesApi } from '../../services/api/challenges.api';
import type { ChallengeWithPlayers } from '../../types/challenge';
import './ChallengeResponse.css';

const MAX_REASON_LENGTH = 200;

interface ScheduleResult {
  matchId?: string;
  scheduledEventId?: string;
  matchDate?: string;
  eventName?: string;
  status?: string;
}

export default function ChallengeResponse() {
  const { t } = useTranslation();
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();

  const [challenge, setChallenge] = useState<ChallengeWithPlayers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null);

  useEffect(() => {
    if (!challengeId) return;
    const controller = new AbortController();
    challengesApi
      .getById(challengeId, controller.signal)
      .then((c) => setChallenge(c))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message || 'Failed to load challenge');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [challengeId]);

  const handleAccept = async () => {
    if (!challengeId) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await challengesApi.respondV2(challengeId, 'accepted');
      if (result.status === 'auto_scheduled' && result.matchId) {
        setScheduleResult({
          matchId: result.matchId,
          scheduledEventId: result.scheduledEventId,
          matchDate: result.matchDate,
          eventName: result.eventName,
          status: result.status,
        });
      } else {
        // Not all opponents accepted yet — go back to MyChallenges
        navigate('/challenges');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept challenge');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!challengeId) return;
    if (!declineReason.trim()) {
      setError('Please provide a reason for declining');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await challengesApi.respondV2(challengeId, 'declined', declineReason.trim());
      navigate('/challenges');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline challenge');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="challenge-response">
        <div className="challenge-response-loading">{t('common.loading')}</div>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="challenge-response">
        <Link to="/challenges" className="challenge-response-back">
          &larr; {t('challenges.detail.backToBoard')}
        </Link>
        <div className="challenge-response-error">
          {error || t('challenges.detail.notFound')}
        </div>
      </div>
    );
  }

  if (scheduleResult) {
    return (
      <div className="challenge-response">
        <div className="challenge-response-success">
          <h2>{t('challenges.response.scheduledHeading', 'Challenge Accepted!')}</h2>
          <p>
            {scheduleResult.eventName
              ? t('challenges.response.scheduledOnEvent', {
                  eventName: scheduleResult.eventName,
                  defaultValue: 'Your match has been scheduled as a Pre-Show match on {{eventName}}.',
                })
              : t('challenges.response.scheduledStandalone', 'Your match has been scheduled as a Pre-Show match.')}
          </p>
          {scheduleResult.matchDate && (
            <p className="challenge-response-date">
              {new Date(scheduleResult.matchDate).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
          <div className="challenge-response-success-actions">
            <Link to="/matches?status=scheduled" className="btn-view-match">
              {t('challenges.response.viewMatch', 'View Match')}
            </Link>
            <Link to="/challenges" className="btn-back-challenges">
              {t('challenges.detail.backToBoard')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="challenge-response">
      <Link to="/challenges" className="challenge-response-back">
        &larr; {t('challenges.detail.backToBoard')}
      </Link>

      <h2>{t('challenges.response.heading', 'Respond to Challenge')}</h2>

      <div className="challenge-response-card">
        <div className="challenge-response-from">
          <span className="challenge-response-label">{t('challenges.detail.challenger')}:</span>
          <strong>{challenge.challenger.wrestlerName}</strong>{' '}
          <span className="challenge-response-player-name">({challenge.challenger.playerName})</span>
        </div>

        <div className="challenge-response-details">
          <div>
            <span className="challenge-response-label">{t('challenges.issue.matchType')}:</span>{' '}
            {challenge.matchType}
          </div>
          {challenge.stipulation && (
            <div>
              <span className="challenge-response-label">{t('challenges.issue.stipulation')}:</span>{' '}
              {challenge.stipulation}
            </div>
          )}
        </div>

        {challenge.opponents && challenge.opponents.length > 1 && (
          <div className="challenge-response-opponents">
            <span className="challenge-response-label">
              {t('challenges.response.challengedOpponents', 'All challenged opponents')}:
            </span>
            <ul>
              {challenge.opponents.map((o) => (
                <li key={o.playerId || o.wrestlerName}>
                  {o.wrestlerName} ({o.playerName})
                </li>
              ))}
            </ul>
          </div>
        )}

        {(challenge.challengeNote || challenge.message) && (
          <div className="challenge-response-note">
            &ldquo;{challenge.challengeNote || challenge.message}&rdquo;
          </div>
        )}
      </div>

      {error && <div className="challenge-response-error">{error}</div>}

      {!showDeclineForm ? (
        <div className="challenge-response-actions">
          <button
            className="btn-accept"
            disabled={submitting}
            onClick={handleAccept}
          >
            {t('challenges.detail.accept')}
          </button>
          <button
            className="btn-decline"
            disabled={submitting}
            onClick={() => setShowDeclineForm(true)}
          >
            {t('challenges.detail.decline')}
          </button>
        </div>
      ) : (
        <div className="challenge-response-decline-form">
          <label>
            {t('challenges.response.declineReasonLabel', 'Reason for declining')} *
          </label>
          <textarea
            value={declineReason}
            onChange={(e) =>
              e.target.value.length <= MAX_REASON_LENGTH && setDeclineReason(e.target.value)
            }
            rows={3}
            placeholder={t('challenges.response.declineReasonPlaceholder', 'Tell them why...')}
            required
          />
          <div className="challenge-response-char-count">
            {declineReason.length}/{MAX_REASON_LENGTH}
          </div>
          <div className="challenge-response-actions">
            <button
              className="btn-decline"
              disabled={submitting || !declineReason.trim()}
              onClick={handleDecline}
            >
              {t('challenges.response.submitDecline', 'Submit Decline')}
            </button>
            <button
              className="btn-cancel-form"
              disabled={submitting}
              onClick={() => {
                setShowDeclineForm(false);
                setDeclineReason('');
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
