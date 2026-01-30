import { useEffect, useState } from 'react';
import { standingsApi } from '../services/api';
import type { Standings as StandingsType } from '../types';
import './Standings.css';

export default function Standings() {
  const [standings, setStandings] = useState<StandingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStandings();
  }, []);

  const loadStandings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await standingsApi.get();
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

  return (
    <div className="standings-container">
      <h2>League Standings</h2>
      <div className="standings-table-wrapper">
        <table className="standings-table">
          <thead>
            <tr>
              <th>Rank</th>
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
