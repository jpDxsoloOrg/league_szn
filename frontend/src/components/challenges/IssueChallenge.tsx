import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { playersApi, challengesApi, profileApi } from '../../services/api';
import type { Player } from '../../types';
import './IssueChallenge.css';

const MAX_MESSAGE_LENGTH = 500;

const MATCH_TYPES = ['Singles', 'Tag Team', 'Triple Threat', 'Fatal 4-Way', 'Six Pack Challenge', 'Battle Royal'];
const STIPULATIONS = ['None', 'Steel Cage', 'Ladder', 'Hell in a Cell', 'Last Man Standing', 'Iron Man', 'Tables'];

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

export default function IssueChallenge() {
  const { t } = useTranslation();
  const [opponentId, setOpponentId] = useState('');
  const [matchType, setMatchType] = useState('');
  const [stipulation, setStipulation] = useState('None');
  const [isChampionship, setIsChampionship] = useState(false);
  const [message, setMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      playersApi.getAll(controller.signal),
      profileApi.getMyProfile(controller.signal),
    ]).then(([data, myProfile]) => {
      setPlayers(data);
      setCurrentPlayerId(myProfile.playerId);
    }).catch(() => {});

    return () => controller.abort();
  }, []);

  const currentPlayer = players.find((p) => p.playerId === currentPlayerId);
  const opponent = players.find((p) => p.playerId === opponentId);
  // Only show players with linked accounts (userId) who can actually respond to challenges
  const availableOpponents = players.filter((p) => p.playerId !== currentPlayerId && p.userId);

  const isFormValid = opponentId && matchType && message.length <= MAX_MESSAGE_LENGTH;

  const handleMessageChange = (value: string) => {
    if (value.length <= MAX_MESSAGE_LENGTH + 50) {
      setMessage(value);
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await challengesApi.create({
        challengedId: opponentId,
        matchType,
        stipulation: stipulation !== 'None' ? stipulation : undefined,
        championshipId: isChampionship ? 'championship-match' : undefined,
        message: message || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue challenge');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setOpponentId('');
    setMatchType('');
    setStipulation('None');
    setIsChampionship(false);
    setMessage('');
    setShowPreview(false);
    setSubmitted(false);
    setError(null);
  };

  if (submitted) {
    return (
      <div className="issue-challenge">
        <div className="issue-success-message">
          <p>{t('challenges.issue.success')}</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Link
              to="/challenges"
              style={{
                backgroundColor: '#d4af37',
                color: '#000',
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              {t('challenges.detail.backToBoard')}
            </Link>
            <button
              onClick={handleReset}
              style={{
                backgroundColor: '#444',
                color: '#ccc',
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {t('challenges.issue.issueAnother')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="issue-challenge">
      <Link to="/challenges" className="issue-challenge-back">
        &larr; {t('challenges.detail.backToBoard')}
      </Link>

      <h2>{t('challenges.issue.title')}</h2>

      {error && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="issue-challenge-form">
        <div className="issue-form-group">
          <label>{t('challenges.issue.selectOpponent')}</label>
          <select value={opponentId} onChange={(e) => setOpponentId(e.target.value)}>
            <option value="">{t('challenges.issue.selectOpponentPlaceholder')}</option>
            {availableOpponents.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.currentWrestler} ({p.name})
              </option>
            ))}
          </select>
        </div>

        <div className="issue-form-group">
          <label>{t('challenges.issue.matchType')}</label>
          <select value={matchType} onChange={(e) => setMatchType(e.target.value)}>
            <option value="">{t('challenges.issue.selectMatchType')}</option>
            {MATCH_TYPES.map((mt) => (
              <option key={mt} value={mt}>
                {mt}
              </option>
            ))}
          </select>
        </div>

        <div className="issue-form-group">
          <label>{t('challenges.issue.stipulation')}</label>
          <select value={stipulation} onChange={(e) => setStipulation(e.target.value)}>
            {STIPULATIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="issue-form-group">
          <label className="issue-championship-check">
            <input
              type="checkbox"
              checked={isChampionship}
              onChange={(e) => setIsChampionship(e.target.checked)}
            />
            <span>{t('challenges.issue.championshipMatch')}</span>
          </label>
        </div>

        <div className="issue-form-group">
          <label>{t('challenges.issue.message')}</label>
          <textarea
            value={message}
            onChange={(e) => handleMessageChange(e.target.value)}
            placeholder={t('challenges.issue.messagePlaceholder')}
            rows={4}
          />
          <div
            className={`issue-char-count ${message.length > MAX_MESSAGE_LENGTH ? 'over-limit' : ''}`}
          >
            {message.length}/{MAX_MESSAGE_LENGTH}
          </div>
        </div>

        {isFormValid && opponent && currentPlayer && (
          <div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              style={{
                background: 'none',
                border: '1px solid #444',
                color: '#bbb',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                width: '100%',
              }}
            >
              {showPreview
                ? t('challenges.issue.hidePreview')
                : t('challenges.issue.showPreview')}
            </button>

            {showPreview && (
              <div className="issue-preview">
                <h3>{t('challenges.issue.preview')}</h3>
                <div className="issue-preview-versus">
                  <div className="issue-preview-player">
                    <div className="issue-preview-avatar">
                      {getInitial(currentPlayer.currentWrestler)}
                    </div>
                    <div className="issue-preview-wrestler">
                      {currentPlayer.currentWrestler}
                    </div>
                    <div className="issue-preview-name">{currentPlayer.name}</div>
                  </div>
                  <span className="issue-preview-vs">{t('common.vs').toUpperCase()}</span>
                  <div className="issue-preview-player">
                    <div className="issue-preview-avatar">
                      {getInitial(opponent.currentWrestler)}
                    </div>
                    <div className="issue-preview-wrestler">{opponent.currentWrestler}</div>
                    <div className="issue-preview-name">{opponent.name}</div>
                  </div>
                </div>
                <div className="issue-preview-details">
                  <span className="issue-preview-detail-tag">{matchType}</span>
                  {stipulation !== 'None' && (
                    <span className="issue-preview-detail-tag">{stipulation}</span>
                  )}
                  {isChampionship && (
                    <span className="issue-preview-detail-tag">
                      {t('challenges.board.titleMatch')}
                    </span>
                  )}
                </div>
                {message && (
                  <div className="issue-preview-message">
                    &ldquo;{message}&rdquo;
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="issue-form-actions">
          <Link to="/challenges" className="btn-cancel-form">
            {t('common.cancel')}
          </Link>
          <button
            className="btn-submit"
            disabled={!isFormValid || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting...' : t('challenges.issue.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
