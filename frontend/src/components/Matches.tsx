import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesApi, playersApi } from '../services/api';
import { formatDateTime } from '../utils/dateUtils';
import type { Match, Player } from '../types';
import './Matches.css';

export default function Matches() {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'completed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reload data when retry button is clicked
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [matchData, playerData] = await Promise.all([
        matchesApi.getAll(filter === 'all' ? {} : { status: filter }),
        playersApi.getAll(),
      ]);
      setMatches(matchData);
      setPlayers(playerData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [matchData, playerData] = await Promise.all([
          matchesApi.getAll(filter === 'all' ? {} : { status: filter }, abortController.signal),
          playersApi.getAll(abortController.signal),
        ]);
        if (!abortController.signal.aborted) {
          setMatches(matchData);
          setPlayers(playerData);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message || 'Failed to load matches');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => abortController.abort();
  }, [filter]);

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : t('common.unknown');
  };

  const isTagTeamMatch = (match: Match): boolean => {
    return match.teams !== undefined && match.teams.length >= 2;
  };

  const formatTeamMembers = (team: string[]): string => {
    return team.map(getPlayerName).join(' & ');
  };

  const getTeamParticipants = (match: Match) => {
    if (!isTagTeamMatch(match)) {
      return match.participants.map(getPlayerName).join(', ');
    }

    // Format as "Team 1 vs Team 2 vs Team 3..."
    return match.teams!.map((team, index) => (
      <span key={index} className="team-display">
        {formatTeamMembers(team)}
        {index < match.teams!.length - 1 && (
          <span className="team-vs"> {t('common.vs')} </span>
        )}
      </span>
    ));
  };

  const getMatchResult = (match: Match) => {
    if (match.status === 'scheduled') {
      return <span className="status-scheduled">{t('common.scheduled')}</span>;
    }

    if (!match.winners || !match.losers) {
      return <span className="status-completed">{t('common.completed')}</span>;
    }

    // For tag team matches, show team-based results
    if (isTagTeamMatch(match) && match.winningTeam !== undefined && match.teams) {
      const winningTeam = match.teams[match.winningTeam];
      const losingTeams = match.teams.filter((_, index) => index !== match.winningTeam);

      if (!winningTeam) {
        return <span className="status-completed">{t('common.completed')}</span>;
      }

      return (
        <div className="match-result tag-team-result">
          <div className="winners">
            <strong>{t('matches.winningTeam')}:</strong>{' '}
            <span className="team-result">{formatTeamMembers(winningTeam)}</span>
          </div>
          <div className="losers">
            <strong>{losingTeams.length > 1 ? t('matches.losingTeams') : t('matches.losingTeam')}:</strong>{' '}
            {losingTeams.map((team, index) => (
              <span key={index} className="team-result">
                {formatTeamMembers(team)}
                {index < losingTeams.length - 1 && ', '}
              </span>
            ))}
          </div>
        </div>
      );
    }

    // Standard match results
    const winners = match.winners.map(getPlayerName).join(', ');
    const losers = match.losers.map(getPlayerName).join(', ');

    return (
      <div className="match-result">
        <div className="winners">
          <strong>{match.winners.length > 1 ? t('matches.winners') : t('matches.winner')}:</strong> {winners}
        </div>
        <div className="losers">
          <strong>{match.losers.length > 1 ? t('matches.losers') : t('matches.loser')}:</strong> {losers}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">{t('matches.loading')}</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>{t('common.error')}: {error}</p>
        <button onClick={loadData}>{t('common.retry')}</button>
      </div>
    );
  }

  return (
    <div className="matches-container">
      <div className="matches-header">
        <h2>{t('matches.title')}</h2>
        <div className="filter-buttons">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            {t('matches.filters.all')}
          </button>
          <button
            className={filter === 'scheduled' ? 'active' : ''}
            onClick={() => setFilter('scheduled')}
          >
            {t('matches.filters.scheduled')}
          </button>
          <button
            className={filter === 'completed' ? 'active' : ''}
            onClick={() => setFilter('completed')}
          >
            {t('matches.filters.completed')}
          </button>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="empty-state">
          <p>{t('matches.noMatches')}</p>
        </div>
      ) : (
        <div className="matches-list">
          {matches.map((match) => (
            <div key={match.matchId} className="match-card">
              <div className="match-header">
                <div className="match-info">
                  <h3>{match.matchType}</h3>
                  {match.stipulation && (
                    <span className="stipulation">{match.stipulation}</span>
                  )}
                  {match.isChampionship && (
                    <span className="championship-badge">{t('matches.championship')}</span>
                  )}
                </div>
                <div className="match-date">{formatDateTime(match.date)}</div>
              </div>

              <div className="match-participants">
                <strong>{t('matches.participants')}:</strong>{' '}
                {isTagTeamMatch(match) ? (
                  <span className="tag-team-participants">
                    {getTeamParticipants(match)}
                  </span>
                ) : (
                  match.participants.map(getPlayerName).join(', ')
                )}
              </div>

              <div className="match-result-section">
                {getMatchResult(match)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
