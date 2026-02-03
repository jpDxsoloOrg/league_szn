import { useEffect, useState } from 'react';
import { standingsApi, divisionsApi } from '../services/api';
import type { Standings as StandingsType, Division, Player } from '../types';
import './Standings.css';

export default function Standings() {
  const [standings, setStandings] = useState<StandingsType | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [standingsData, divisionsData] = await Promise.all([
        standingsApi.get(),
        divisionsApi.getAll(),
      ]);
      setStandings(standingsData);
      setDivisions(divisionsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load standings');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredPlayers = (): Player[] => {
    if (!standings) return [];

    if (selectedDivision === 'all') {
      return standings.players;
    }

    if (selectedDivision === 'none') {
      return standings.players.filter(p => !p.divisionId);
    }

    return standings.players.filter(p => p.divisionId === selectedDivision);
  };

  const getDivisionName = (divisionId?: string) => {
    if (!divisionId) return null;
    const division = divisions.find(d => d.divisionId === divisionId);
    return division?.name || null;
  };

  const renderStandingsTable = (players: Player[], showRank: boolean = true) => {
    if (players.length === 0) {
      return <p className="no-players-message">No players in this division.</p>;
    }

    return (
      <div className="standings-table-wrapper">
        <table className="standings-table">
          <thead>
            <tr>
              {showRank && <th>Rank</th>}
              <th>Player</th>
              <th>Wrestler</th>
              {selectedDivision === 'all' && <th>Division</th>}
              <th>Wins</th>
              <th>Losses</th>
              <th>Draws</th>
              <th>Win %</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => {
              const totalMatches = player.wins + player.losses + player.draws;
              const winPercentage = totalMatches > 0
                ? ((player.wins / totalMatches) * 100).toFixed(1)
                : '0.0';

              return (
                <tr key={player.playerId}>
                  {showRank && <td className="rank">{index + 1}</td>}
                  <td className="player-name">{player.name}</td>
                  <td className="wrestler-name">{player.currentWrestler}</td>
                  {selectedDivision === 'all' && (
                    <td className="division-name">
                      {getDivisionName(player.divisionId) || <span className="no-division">-</span>}
                    </td>
                  )}
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
    );
  };

  if (loading) {
    return <div className="loading">Loading standings...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={loadData}>Retry</button>
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

  const filteredPlayers = getFilteredPlayers();

  return (
    <div className="standings-container">
      <h2>League Standings</h2>

      {divisions.length > 0 && (
        <div className="division-filter">
          <span className="filter-label">Filter by Division:</span>
          <div className="filter-buttons">
            <button
              className={`filter-btn ${selectedDivision === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedDivision('all')}
            >
              All
            </button>
            {divisions.map((division) => (
              <button
                key={division.divisionId}
                className={`filter-btn ${selectedDivision === division.divisionId ? 'active' : ''}`}
                onClick={() => setSelectedDivision(division.divisionId)}
              >
                {division.name}
              </button>
            ))}
            <button
              className={`filter-btn ${selectedDivision === 'none' ? 'active' : ''}`}
              onClick={() => setSelectedDivision('none')}
            >
              No Division
            </button>
          </div>
        </div>
      )}

      {renderStandingsTable(filteredPlayers)}
    </div>
  );
}
