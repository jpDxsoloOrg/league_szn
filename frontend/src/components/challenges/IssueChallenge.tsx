import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  mockChallengePlayers,
  mockCurrentPlayerId,
  matchTypes,
  stipulations,
} from '../../mocks/challengeMockData';
import './IssueChallenge.css';

const MAX_MESSAGE_LENGTH = 500;

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

  const currentPlayer = mockChallengePlayers.find(
    (p) => p.playerId === mockCurrentPlayerId
  );
  const opponent = mockChallengePlayers.find((p) => p.playerId === opponentId);
  const availableOpponents = mockChallengePlayers.filter(
    (p) => p.playerId !== mockCurrentPlayerId
  );

  const isFormValid = opponentId && matchType && message.length <= MAX_MESSAGE_LENGTH;

  const handleMessageChange = (value: string) => {
    if (value.length <= MAX_MESSAGE_LENGTH + 50) {
      setMessage(value);
    }
  };

  const handleSubmit = () => {
    if (!isFormValid) return;
    setSubmitted(true);
  };

  const handleReset = () => {
    setOpponentId('');
    setMatchType('');
    setStipulation('None');
    setIsChampionship(false);
    setMessage('');
    setShowPreview(false);
    setSubmitted(false);
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

      <div className="issue-challenge-form">
        <div className="issue-form-group">
          <label>{t('challenges.issue.selectOpponent')}</label>
          <select value={opponentId} onChange={(e) => setOpponentId(e.target.value)}>
            <option value="">{t('challenges.issue.selectOpponentPlaceholder')}</option>
            {availableOpponents.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.wrestlerName} ({p.playerName})
              </option>
            ))}
          </select>
        </div>

        <div className="issue-form-group">
          <label>{t('challenges.issue.matchType')}</label>
          <select value={matchType} onChange={(e) => setMatchType(e.target.value)}>
            <option value="">{t('challenges.issue.selectMatchType')}</option>
            {matchTypes.map((mt) => (
              <option key={mt} value={mt}>
                {mt}
              </option>
            ))}
          </select>
        </div>

        <div className="issue-form-group">
          <label>{t('challenges.issue.stipulation')}</label>
          <select value={stipulation} onChange={(e) => setStipulation(e.target.value)}>
            {stipulations.map((s) => (
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
                      {getInitial(currentPlayer.wrestlerName)}
                    </div>
                    <div className="issue-preview-wrestler">
                      {currentPlayer.wrestlerName}
                    </div>
                    <div className="issue-preview-name">{currentPlayer.playerName}</div>
                  </div>
                  <span className="issue-preview-vs">{t('common.vs').toUpperCase()}</span>
                  <div className="issue-preview-player">
                    <div className="issue-preview-avatar">
                      {getInitial(opponent.wrestlerName)}
                    </div>
                    <div className="issue-preview-wrestler">{opponent.wrestlerName}</div>
                    <div className="issue-preview-name">{opponent.playerName}</div>
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
            disabled={!isFormValid}
            onClick={handleSubmit}
          >
            {t('challenges.issue.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
