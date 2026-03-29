import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { playersApi, challengesApi, profileApi, stipulationsApi, matchTypesApi, tagTeamsApi } from '../../services/api';
import type { Player, Stipulation, MatchType } from '../../types';
import type { TagTeam } from '../../types/tagTeam';
import { getInitial } from './challengeUtils';
import './IssueChallenge.css';

const MAX_MESSAGE_LENGTH = 500;

export default function IssueChallenge() {
  const { t } = useTranslation();
  const [opponentId, setOpponentId] = useState('');
  const [matchType, setMatchType] = useState('');
  const [stipulation, setStipulation] = useState('');
  const [isChampionship, setIsChampionship] = useState(false);
  const [message, setMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [challengeMode, setChallengeMode] = useState<'singles' | 'tag_team'>('singles');
  const [tagTeams, setTagTeams] = useState<TagTeam[]>([]);
  const [playerTagTeam, setPlayerTagTeam] = useState<TagTeam | null>(null);
  const [selectedTagTeamId, setSelectedTagTeamId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      playersApi.getAll(controller.signal),
      profileApi.getMyProfile(controller.signal),
      stipulationsApi.getAll(controller.signal),
      matchTypesApi.getAll(controller.signal),
      tagTeamsApi.getAll({ status: 'active' }, controller.signal),
    ]).then(([data, myProfile, stips, mTypes, fetchedTagTeams]) => {
      setPlayers(data);
      setCurrentPlayerId(myProfile.playerId);
      setStipulations(stips);
      setMatchTypes(mTypes);
      const myTeam = fetchedTagTeams.find(
        (tt) => tt.player1Id === myProfile.playerId || tt.player2Id === myProfile.playerId
      );
      setPlayerTagTeam(myTeam || null);
      setTagTeams(fetchedTagTeams);
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        console.error('Failed to load data:', err);
      }
    });

    return () => controller.abort();
  }, []);

  const currentPlayer = players.find((p) => p.playerId === currentPlayerId);
  const opponent = players.find((p) => p.playerId === opponentId);
  // Only show players with linked accounts (userId) who can actually respond to challenges
  const availableOpponents = players.filter((p) => p.playerId !== currentPlayerId && p.userId);

  const selectedTagTeam = tagTeams.find((tt) => tt.tagTeamId === selectedTagTeamId);

  const isFormValid = challengeMode === 'tag_team'
    ? selectedTagTeamId && matchType && message.length <= MAX_MESSAGE_LENGTH
    : opponentId && matchType && message.length <= MAX_MESSAGE_LENGTH;

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
      if (challengeMode === 'tag_team') {
        await challengesApi.create({
          challengedId: '',
          challengeMode: 'tag_team',
          challengedTagTeamId: selectedTagTeamId,
          matchType,
          stipulation: stipulation || undefined,
          message: message || undefined,
        });
      } else {
        await challengesApi.create({
          challengedId: opponentId,
          matchType,
          stipulation: stipulation || undefined,
          championshipId: isChampionship ? 'championship-match' : undefined,
          message: message || undefined,
        });
      }
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
    setStipulation('');
    setIsChampionship(false);
    setMessage('');
    setShowPreview(false);
    setSubmitted(false);
    setError(null);
    setChallengeMode('singles');
    setSelectedTagTeamId('');
  };

  if (submitted) {
    return (
      <div className="issue-challenge">
        <div className="issue-success-message">
          <p>{t('challenges.issue.success')}</p>
          <div className="issue-success-actions">
            <Link
              to="/challenges"
              className="issue-success-back-link"
            >
              {t('challenges.detail.backToBoard')}
            </Link>
            <button
              onClick={handleReset}
              className="issue-success-another-btn"
            >
              {t('challenges.issue.issueAnother')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Helper to get player names for a tag team (for preview display)
  const getTagTeamPlayerNames = (tt: TagTeam): string => {
    const p1 = players.find((p) => p.playerId === tt.player1Id);
    const p2 = players.find((p) => p.playerId === tt.player2Id);
    const name1 = p1 ? p1.currentWrestler : tt.player1Id;
    const name2 = p2 ? p2.currentWrestler : tt.player2Id;
    return `${name1} & ${name2}`;
  };

  const canShowPreview = challengeMode === 'tag_team'
    ? isFormValid && playerTagTeam && selectedTagTeam
    : isFormValid && opponent && currentPlayer;

  return (
    <div className="issue-challenge">
      <Link to="/challenges" className="issue-challenge-back">
        &larr; {t('challenges.detail.backToBoard')}
      </Link>

      <h2>{t('challenges.issue.title')}</h2>

      {error && (
        <div className="issue-error-message">
          {error}
        </div>
      )}

      <div className="issue-challenge-form">
        {playerTagTeam && (
          <div className="issue-form-group">
            <label>{t('challenges.issue.challengeMode')}</label>
            <div className="challenge-mode-toggle">
              <label className="challenge-mode-option">
                <input
                  type="radio"
                  name="challengeMode"
                  value="singles"
                  checked={challengeMode === 'singles'}
                  onChange={() => { setChallengeMode('singles'); setSelectedTagTeamId(''); }}
                />
                {t('challenges.issue.singlesChallenge')}
              </label>
              <label className="challenge-mode-option">
                <input
                  type="radio"
                  name="challengeMode"
                  value="tag_team"
                  checked={challengeMode === 'tag_team'}
                  onChange={() => { setChallengeMode('tag_team'); setOpponentId(''); }}
                />
                {t('challenges.issue.tagTeamChallenge')}
              </label>
            </div>
            {challengeMode === 'tag_team' && (
              <div className="on-behalf-of">
                {t('challenges.issue.onBehalfOf')}: <strong>{playerTagTeam.name}</strong>
              </div>
            )}
          </div>
        )}

        {challengeMode === 'tag_team' ? (
          <div className="issue-form-group">
            <label>{t('challenges.issue.selectOpponentTeam')}</label>
            <select value={selectedTagTeamId} onChange={(e) => setSelectedTagTeamId(e.target.value)}>
              <option value="">{t('challenges.issue.selectOpponentTeamPlaceholder')}</option>
              {tagTeams
                .filter((tt) => tt.tagTeamId !== playerTagTeam?.tagTeamId)
                .map((tt) => (
                  <option key={tt.tagTeamId} value={tt.tagTeamId}>
                    {tt.name}
                  </option>
                ))}
            </select>
          </div>
        ) : (
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
        )}

        <div className="issue-form-group">
          <label>{t('challenges.issue.matchType')}</label>
          <select value={matchType} onChange={(e) => setMatchType(e.target.value)}>
            <option value="">{t('challenges.issue.selectMatchType')}</option>
            {matchTypes.map((mt) => (
              <option key={mt.matchTypeId} value={mt.name}>
                {mt.name}
              </option>
            ))}
          </select>
        </div>

        <div className="issue-form-group">
          <label>{t('challenges.issue.stipulation')}</label>
          <select value={stipulation} onChange={(e) => setStipulation(e.target.value)}>
            <option value="">{t('common.none', 'None')}</option>
            {stipulations.map((s) => (
              <option key={s.stipulationId} value={s.name}>
                {s.name}
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

        {canShowPreview && (
          <div>
            <button
              className="issue-preview-toggle"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview
                ? t('challenges.issue.hidePreview')
                : t('challenges.issue.showPreview')}
            </button>

            {showPreview && challengeMode === 'tag_team' && playerTagTeam && selectedTagTeam && (
              <div className="issue-preview">
                <h3>{t('challenges.issue.preview')}</h3>
                <div className="issue-preview-versus">
                  <div className="issue-preview-player">
                    <div className="issue-preview-avatar">
                      {getInitial(playerTagTeam.name)}
                    </div>
                    <div className="issue-preview-wrestler">
                      {playerTagTeam.name}
                    </div>
                    <div className="issue-preview-name">
                      {getTagTeamPlayerNames(playerTagTeam)}
                    </div>
                  </div>
                  <span className="issue-preview-vs">{t('common.vs').toUpperCase()}</span>
                  <div className="issue-preview-player">
                    <div className="issue-preview-avatar">
                      {getInitial(selectedTagTeam.name)}
                    </div>
                    <div className="issue-preview-wrestler">
                      {selectedTagTeam.name}
                    </div>
                    <div className="issue-preview-name">
                      {getTagTeamPlayerNames(selectedTagTeam)}
                    </div>
                  </div>
                </div>
                <div className="issue-preview-details">
                  <span className="issue-preview-detail-tag">{matchType}</span>
                  {stipulation && (
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

            {showPreview && challengeMode === 'singles' && currentPlayer && opponent && (
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
                  {stipulation && (
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
            {submitting ? t('common.submitting') : t('challenges.issue.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
