import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesApi } from '../../services/api';
import type { Match, Player } from '../../types';
import type { TagTeam } from '../../types/tagTeam';
import { formatMatchDate } from '../../utils/dateUtils';
import { formatMatchType } from '../../utils/matchDisplay';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import './MatchResultForm.css';

/** The API's wording for a result it refuses, so it can show translated. */
const RESULT_ERROR_KEYS: Record<string, string> = {
  'The current champion is no longer in this title match. Edit the match, or make it a non-title match, then record the result.': 'recordResult.championNotInMatch',
};

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTagTeamMatch = !!(match.teams && match.teams.length >= 2);

  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.playerId === playerId);
    if (!player) return t('common.unknown');
    return player.currentWrestler ? `${player.name} (${player.currentWrestler})` : player.name;
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
    setError(null);

    if (!isDraw && isTagTeamMatch && (winningTeamIndex === null || winners.length === 0)) {
      setError(t('recordResult.selectWinningTeam'));
      return;
    }
    if (!isDraw && winners.length === 0) {
      setError(t('recordResult.selectWinner'));
      return;
    }

    const losers = match.participants.filter(playerId => !winners.includes(playerId));
    const result = isDraw
      ? { winners: match.participants, losers: [], isDraw: true }
      : isTagTeamMatch && winningTeamIndex !== null
        ? { winners, losers, winningTeam: winningTeamIndex }
        : { winners, losers };

    setSubmitting(true);
    try {
      await matchesApi.recordResult(match.matchId, result);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('recordResult.error');
      const translationKey = RESULT_ERROR_KEYS[message];
      setError(translationKey ? t(translationKey) : message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="match-result-form">
      {error && <p className="match-result-form__error" role="alert">{error}</p>}

      <dl className="match-result-form__details">
        <div>
          <dt>{t('recordResult.matchType')}</dt>
          <dd>{formatMatchType(match.matchFormat, t)}</dd>
        </div>
        <div>
          <dt>{t('recordResult.date')}</dt>
          <dd>{formatMatchDate(match.date)}</dd>
        </div>
      </dl>

      <label className="match-result-form__draw">
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
        />
        <span>{t('events.forms.draw', 'Draw')}</span>
      </label>

      {isDraw ? (
        <div className="match-result-form__group">
          <h3 className="match-result-form__heading">{t('events.forms.drawHint', 'All participants will receive a draw.')}</h3>
          <ul className="match-result-form__draw-list">
            {match.participants.map(playerId => (
              <li key={playerId}>{getPlayerName(playerId)}</li>
            ))}
          </ul>
        </div>
      ) : isTagTeamMatch ? (
        <div className="match-result-form__group">
          <h3 className="match-result-form__heading">{t('recordResult.selectWinningTeamTitle')}</h3>
          {match.teams!.map((team, teamIndex) => (
            <button
              key={teamIndex}
              type="button"
              className={`team-option ${winningTeamIndex === teamIndex ? 'winner' : ''}`}
              aria-pressed={winningTeamIndex === teamIndex}
              onClick={() => handleTeamWinnerSelect(teamIndex)}
            >
              <span className="match-result-form__option-text">
                <span className="match-result-form__option-name">{getTeamDisplayName(team)}</span>
                <span className="match-result-form__option-meta">
                  {team.map(playerId => getPlayerName(playerId)).join(', ')}
                </span>
              </span>
              {winningTeamIndex === teamIndex && <Badge tone="win">{t('recordResult.winner')}</Badge>}
            </button>
          ))}
        </div>
      ) : (
        <div className="match-result-form__group">
          <h3 className="match-result-form__heading">{t('recordResult.selectWinners')}</h3>
          {match.participants.map(playerId => (
            <button
              key={playerId}
              type="button"
              className={`participant-option ${winners.includes(playerId) ? 'winner' : ''}`}
              aria-pressed={winners.includes(playerId)}
              onClick={() => handleWinnerToggle(playerId)}
            >
              <span className="match-result-form__option-name">{getPlayerName(playerId)}</span>
              {winners.includes(playerId) && <Badge tone="win">{t('recordResult.winner')}</Badge>}
            </button>
          ))}
        </div>
      )}

      <div className="match-result-form__actions">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={!isDraw && winners.length === 0} loading={submitting}>
          {t('recordResult.recordResult')}
        </Button>
      </div>
    </div>
  );
}
