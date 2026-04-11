import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesApi } from '../../services/api';
import type { Match, Player } from '../../types';
import type { TagTeam } from '../../types/tagTeam';
import './MatchResultForm.css';

interface MatchResultFormProps {
  match: Match;
  players: Player[];
  tagTeams: (TagTeam & { player1Name?: string; player2Name?: string })[];
  onSuccess: () => void;
  onCancel: () => void;
}

export default function MatchResultForm({
  match,
  players,
  tagTeams,
  onSuccess,
  onCancel,
}: MatchResultFormProps) {
  const { t } = useTranslation();
  const [winners, setWinners] = useState<string[]>([]);
  const [isDraw, setIsDraw] = useState(false);
  const [winningTeamIndex, setWinningTeamIndex] = useState<number | null>(null);
  const [starRating, setStarRating] = useState<number | ''>('');
  const [matchOfTheNight, setMatchOfTheNight] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTagTeamMatch = !!(match.teams && match.teams.length >= 2);

  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.playerId === playerId);
    return player ? `${player.name} (${player.currentWrestler})` : 'Unknown';
  };

  const getPlayerNameShort = (playerId: string): string => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : t('common.unknown');
  };

  /** Get display name for a team: tag team name if it exists, or "Player1 & Player2" */
  const getTeamDisplayName = (teamMembers: string[]): string => {
    if (teamMembers.length === 2) {
      const tt = tagTeams.find(
        tag => (tag.player1Id === teamMembers[0] && tag.player2Id === teamMembers[1])
          || (tag.player1Id === teamMembers[1] && tag.player2Id === teamMembers[0])
      );
      if (tt) return tt.name;
    }
    return teamMembers.map(pid => getPlayerNameShort(pid)).join(' & ');
  };

  const handleWinnerToggle = (playerId: string) => {
    setWinners(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleTeamWinnerSelect = (teamIndex: number) => {
    if (!match.teams) return;

    if (winningTeamIndex === teamIndex) {
      // Deselect this team
      setWinningTeamIndex(null);
      setWinners([]);
    } else {
      // Select this team as winner
      setWinningTeamIndex(teamIndex);
      const team = match.teams[teamIndex];
      setWinners(team ?? []);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;

    setSubmitting(true);

    if (isDraw) {
      // Draw: all participants get draw stat
      try {
        setError(null);
        const payload: { winners: string[]; losers: string[]; isDraw: boolean; starRating?: number; matchOfTheNight?: boolean } = {
          winners: match.participants,
          losers: [],
          isDraw: true,
        };
        if (starRating !== '') payload.starRating = starRating as number;
        if (matchOfTheNight) payload.matchOfTheNight = true;
        await matchesApi.recordResult(match.matchId, payload);
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('recordResult.error'));
      } finally {
        setSubmitting(false);
      }
    } else if (isTagTeamMatch) {
      // Tag team match validation
      if (winningTeamIndex === null || winners.length === 0) {
        setError(t('recordResult.selectWinningTeam'));
        setSubmitting(false);
        return;
      }

      // All non-winning team members are losers
      const losers = match.participants.filter(p => !winners.includes(p));

      try {
        setError(null);
        const payload: { winners: string[]; losers: string[]; winningTeam: number; starRating?: number; matchOfTheNight?: boolean } = {
          winners,
          losers,
          winningTeam: winningTeamIndex,
        };
        if (starRating !== '') payload.starRating = starRating as number;
        if (matchOfTheNight) payload.matchOfTheNight = true;
        await matchesApi.recordResult(match.matchId, payload);
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('recordResult.error'));
      } finally {
        setSubmitting(false);
      }
    } else {
      // Standard match validation
      if (winners.length === 0) {
        setError(t('recordResult.selectWinner'));
        setSubmitting(false);
        return;
      }

      const losers = match.participants.filter(p => !winners.includes(p));

      try {
        setError(null);
        const payload: { winners: string[]; losers: string[]; starRating?: number; matchOfTheNight?: boolean } = { winners, losers };
        if (starRating !== '') payload.starRating = starRating as number;
        if (matchOfTheNight) payload.matchOfTheNight = true;
        await matchesApi.recordResult(match.matchId, payload);
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('recordResult.error'));
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="match-result-form">
      {error && <div className="error-message">{error}</div>}

      <div className="match-details">
        <div className="detail-row">
          <strong>Match Type:</strong> {match.matchFormat}
        </div>
        <div className="detail-row">
          <strong>Date:</strong> {new Date(match.date).toLocaleString()}
        </div>
      </div>

      <div className="draw-toggle-row">
        <label className="draw-toggle-label">
          <input
            type="checkbox"
            checked={isDraw}
            onChange={(e) => {
              setIsDraw(e.target.checked);
              if (e.target.checked) {
                setWinners([]);
                setWinningTeamIndex(null);
              }
            }}
            className="draw-toggle-checkbox"
          />
          <span className="draw-toggle-text">Draw</span>
        </label>
        {isDraw && (
          <span className="draw-hint">All participants will receive a draw.</span>
        )}
      </div>

      <div className="participants-selection">
        {isDraw ? (
          <div className="draw-participants-list">
            <h4>Draw Participants</h4>
            {match.participants.map(playerId => (
              <div key={playerId} className="participant-option draw">
                <div className="participant-info">
                  {getPlayerName(playerId)}
                </div>
                <span className="draw-badge">Draw</span>
              </div>
            ))}
          </div>
        ) : isTagTeamMatch ? (
          <>
            <h4>{t('recordResult.selectWinningTeamTitle')}</h4>
            <div className="teams-list">
              {match.teams!.map((team, teamIndex) => (
                <div
                  key={teamIndex}
                  className={`team-option ${winningTeamIndex === teamIndex ? 'winner' : ''}`}
                  onClick={() => handleTeamWinnerSelect(teamIndex)}
                >
                  <div className="team-info">
                    <div className="team-label">{getTeamDisplayName(team)}</div>
                    <div className="team-members-list">
                      {team.map(playerId => (
                        <span key={playerId} className="team-member-name">
                          {getPlayerName(playerId)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {winningTeamIndex === teamIndex && (
                    <span className="winner-badge">{t('recordResult.winner')}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h4>{t('recordResult.selectWinners')}</h4>
            <div className="participants-list">
              {match.participants.map(playerId => (
                <div
                  key={playerId}
                  className={`participant-option ${winners.includes(playerId) ? 'winner' : ''}`}
                  onClick={() => handleWinnerToggle(playerId)}
                >
                  <div className="participant-info">
                    {getPlayerName(playerId)}
                  </div>
                  {winners.includes(playerId) && (
                    <span className="winner-badge">{t('recordResult.winner')}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="rating-awards-block">
        <div className="star-rating-row">
          <span className="star-rating-label">{t('match.starRating')}</span>
          <div className="star-rating-stars" role="group" aria-label={t('match.starRating')}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`star-btn ${typeof starRating === 'number' && starRating >= value ? 'filled' : ''}`}
                onClick={() => setStarRating(starRating === value ? '' : value)}
                title={`${value} ${value === 1 ? 'star' : 'stars'}`}
                aria-pressed={typeof starRating === 'number' && starRating >= value}
              >
                {typeof starRating === 'number' && starRating >= value ? '\u2605' : '\u2606'}
              </button>
            ))}
          </div>
          {starRating !== '' && (
            <button
              type="button"
              className="star-rating-clear"
              onClick={() => setStarRating('')}
            >
              {t('match.clearRating')}
            </button>
          )}
        </div>
        <div className="motn-row">
          <label className="motn-label">
            <input
              type="checkbox"
              checked={matchOfTheNight}
              onChange={(e) => setMatchOfTheNight(e.target.checked)}
              className="motn-checkbox"
            />
            <span className="motn-text">{t('match.matchOfTheNight')}</span>
          </label>
        </div>
      </div>

      <div className="result-actions">
        <button onClick={handleSubmit} disabled={(!isDraw && winners.length === 0) || submitting}>
          {submitting ? 'Recording...' : 'Record Result'}
        </button>
        <button onClick={onCancel} className="cancel-btn" disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
