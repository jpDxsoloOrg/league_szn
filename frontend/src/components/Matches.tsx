import { useEffect, useState } from 'react';
import { matchesApi, playersApi } from '../services/api';
import type { Match, Player } from '../types';
import './Matches.css';

export default function Matches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'completed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
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
  };

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : 'Unknown';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMatchResult = (match: Match) => {
    if (match.status === 'scheduled') {
      return <span className="status-scheduled">Scheduled</span>;
    }

    if (!match.winners || !match.losers) {
      return <span className="status-completed">Completed</span>;
    }

    const winners = match.winners.map(getPlayerName).join(', ');
    const losers = match.losers.map(getPlayerName).join(', ');

    return (
      <div className="match-result">
        <div className="winners">
          <strong>Winner{match.winners.length > 1 ? 's' : ''}:</strong> {winners}
        </div>
        <div className="losers">
          <strong>Loser{match.losers.length > 1 ? 's' : ''}:</strong> {losers}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading matches...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={loadData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="matches-container">
      <div className="matches-header">
        <h2>Matches</h2>
        <div className="filter-buttons">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={filter === 'scheduled' ? 'active' : ''}
            onClick={() => setFilter('scheduled')}
          >
            Scheduled
          </button>
          <button
            className={filter === 'completed' ? 'active' : ''}
            onClick={() => setFilter('completed')}
          >
            Completed
          </button>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="empty-state">
          <p>No matches found.</p>
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
                    <span className="championship-badge">Championship</span>
                  )}
                </div>
                <div className="match-date">{formatDate(match.date)}</div>
              </div>

              <div className="match-participants">
                <strong>Participants:</strong>{' '}
                {match.participants.map(getPlayerName).join(', ')}
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
