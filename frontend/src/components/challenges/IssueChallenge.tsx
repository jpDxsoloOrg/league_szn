import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { playersApi, challengesApi, profileApi, stipulationsApi, matchTypesApi, tagTeamsApi } from '../../services/api';
import type { Player, Stipulation, MatchType } from '../../types';
import type { TagTeam } from '../../types/tagTeam';
import { getInitial } from './challengeUtils';
import './IssueChallenge.css';

const MAX_CHALLENGE_NOTE_LENGTH = 200;
const MAX_OPPONENTS = 5;

export default function IssueChallenge() {
  const { t } = useTranslation();
  const [opponentIds, setOpponentIds] = useState<string[]>([]);
  const [matchType, setMatchType] = useState('');
  const [stipulation, setStipulation] = useState('');
  const [isChampionship, setIsChampionship] = useState(false);
  const [challengeNote, setChallengeNote] = useState('');
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
  const selectedOpponents = players.filter((p) => opponentIds.includes(p.playerId));
  // Only show players with linked accounts (userId) who can actually respond to challenges
  const availableOpponents = players.filter((p) => p.playerId !== currentPlayerId && p.userId);

  const selectedTagTeam = tagTeams.find((tt) => tt.tagTeamId === selectedTagTeamId);

  const isFormValid = challengeMode === 'tag_team'
    ? !!selectedTagTeamId && !!matchType && challengeNote.length <= MAX_CHALLENGE_NOTE_LENGTH
    : opponentIds.length > 0 && opponentIds.length <= MAX_OPPONENTS && !!matchType && challengeNote.length <= MAX_CHALLENGE_NOTE_LENGTH;

  const handleChallengeNoteChange = (value: string) => {
    if (value.length <= MAX_CHALLENGE_NOTE_LENGTH + 20) {
      setChallengeNote(value);
    }
  };

  const toggleOpponent = (playerId: string) => {
    setOpponentIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= MAX_OPPONENTS) return prev;
      return [...prev, playerId];
    });
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setSubmitting(true);
    setError(null);
    try {
      if (challengeMode === 'tag_team') {
        await challengesApi.create({
          challengeMode: 'tag_team',
          challengedTagTeamId: selectedTagTeamId,
          matchType,
          stipulation: stipulation || undefined,
          challengeNote: challengeNote || undefined,
        });
      } else {
        await challengesApi.create({
          opponentIds,
          matchType,
          stipulation: stipulation || undefined,
          championshipId: isChampionship ? 'championship-match' : undefined,
          challengeNote: challengeNote || undefined,
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
    setOpponentIds([]);
    setMatchType('');
    setStipulation('');
    setIsChampionship(false);
    setChallengeNote('');
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
    : isFormValid && selectedOpponents.length > 0 && currentPlayer;

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
                  onChange={() => { setChallengeMode('tag_team'); setOpponentIds([]); }}
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
            <label>
              {t('challenges.issue.selectOpponent')} ({opponentIds.length}/{MAX_OPPONENTS})
            </label>
            <div className="issue-opponent-multiselect" role="group">
              {availableOpponents.map((p) => {
                const checked = opponentIds.includes(p.playerId);
                const disabled = !checked && opponentIds.length >= MAX_OPPONENTS;
                return (
                  <label
                    key={p.playerId}
                    className={`issue-opponent-option${checked ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleOpponent(p.playerId)}
                    />
                    <span>{p.currentWrestler} ({p.name})</span>
                  </label>
                );
              })}
            </div>
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
          <label>{t('challenges.issue.challengeNote', 'Optional note')}</label>
          <textarea
            value={challengeNote}
            onChange={(e) => handleChallengeNoteChange(e.target.value)}
            placeholder={t('challenges.issue.challengeNotePlaceholder', 'Add a short note (optional)')}
            rows={3}
          />
          <div
            className={`issue-char-count ${challengeNote.length > MAX_CHALLENGE_NOTE_LENGTH ? 'over-limit' : ''}`}
          >
            {challengeNote.length}/{MAX_CHALLENGE_NOTE_LENGTH}
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
                {challengeNote && (
                  <div className="issue-preview-message">
                    &ldquo;{challengeNote}&rdquo;
                  </div>
                )}
              </div>
            )}

            {showPreview && challengeMode === 'singles' && currentPlayer && selectedOpponents.length > 0 && (
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
                  <div className="issue-preview-opponents">
                    {selectedOpponents.map((op) => (
                      <div key={op.playerId} className="issue-preview-player">
                        <div className="issue-preview-avatar">
                          {getInitial(op.currentWrestler)}
                        </div>
                        <div className="issue-preview-wrestler">{op.currentWrestler}</div>
                        <div className="issue-preview-name">{op.name}</div>
                      </div>
                    ))}
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
                {challengeNote && (
                  <div className="issue-preview-message">
                    &ldquo;{challengeNote}&rdquo;
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
