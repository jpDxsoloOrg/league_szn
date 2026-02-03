import { useEffect, useState } from 'react';
import { standingsApi, seasonsApi } from '../services/api';
import type { Standings as StandingsType, Season } from '../types';
import './Standings.css';

export default function Standings() {
  const [standings, setStandings] = useState<StandingsType | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSeasons();
  }, []);

  useEffect(() => {
    loadStandings();
  }, [selectedSeasonId]);

  const loadSeasons = async () => {
    try {
      const data = await seasonsApi.getAll();
      setSeasons(data);
    } catch (err) {
      console.error('Failed to load seasons:', err);
    }
  };

  const loadStandings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await standingsApi.get(selectedSeasonId || undefined);
      setStandings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load standings');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading standings...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={loadStandings}>Retry</button>
      </div>
    );
  }

  if (!standings || standings.players.length === 0) {
    return (
      <div className="empty-state">
        <h2>Standings</h2>
        <p>No players have been added to the league yet.</p>
      </div>
    );
  }

  const getSeasonName = () => {
    if (!selectedSeasonId) return 'All-Time';
    const season = seasons.find(s => s.seasonId === selectedSeasonId);
    return season ? season.name : 'All-Time';
  };

  return (
    <div className="standings-container">
      <div className="standings-header">
        <h2>League Standings</h2>
        {seasons.length > 0 && (
          <div className="season-selector">
            <label htmlFor="season-select">Season:</label>
            <select
              id="season-select"
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
            >
              <option value="">All-Time</option>
              {seasons.map((season) => (
                <option key={season.seasonId} value={season.seasonId}>
                  {season.name} {season.status === 'active' ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {selectedSeasonId && (
        <div className="season-badge">
          Showing standings for: <strong>{getSeasonName()}</strong>
        </div>
      )}
      <div className="standings-table-wrapper">
        <table className="standings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th className="image-header">Image</th>
              <th>Player</th>
              <th>Wrestler</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Draws</th>
              <th>Win %</th>
            </tr>
          </thead>
          <tbody>
            {standings.players.map((player, index) => {
              const totalMatches = player.wins + player.losses + player.draws;
              const winPercentage = totalMatches > 0
                ? ((player.wins / totalMatches) * 100).toFixed(1)
                : '0.0';

              return (
                <tr key={player.playerId}>
                  <td className="rank">{index + 1}</td>
                  <td className="wrestler-image-cell">
                    {player.imageUrl ? (
                      <img
                        src={player.imageUrl}
                        alt={player.currentWrestler}
                        className="wrestler-thumbnail"
                      />
                    ) : (
                      <div className="no-image-placeholder">-</div>
                    )}
                  </td>
                  <td className="player-name">{player.name}</td>
                  <td className="wrestler-name">{player.currentWrestler}</td>
                  <td className="wins">{player.wins}</td>
                  <td className="losses">{player.losses}</td>
                  <td className="draws">{player.draws}</td>
                  <td className="win-percentage">{winPercentage}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
