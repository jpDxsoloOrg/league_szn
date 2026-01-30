import { useEffect, useState } from 'react';
import { tournamentsApi, playersApi } from '../services/api';
import type { Tournament, Player } from '../types';
import './Tournaments.css';

export default function Tournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [tournamentData, playerData] = await Promise.all([
        tournamentsApi.getAll(),
        playersApi.getAll(),
      ]);
      setTournaments(tournamentData);
      setPlayers(playerData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  };

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : 'Unknown';
  };

  const getStatusBadge = (status: string) => {
    const classMap = {
      upcoming: 'status-upcoming',
      'in-progress': 'status-in-progress',
      completed: 'status-completed',
    };
    return <span className={`status-badge ${classMap[status as keyof typeof classMap]}`}>{status}</span>;
  };

  const renderRoundRobinStandings = (tournament: Tournament) => {
    if (!tournament.standings) return null;

    const standingsArray = Object.entries(tournament.standings).map(([playerId, stats]: [string, any]) => ({
      playerId,
      ...stats,
    }));

    // Sort by points descending
    standingsArray.sort((a, b) => b.points - a.points);

    return (
      <div className="round-robin-standings">
        <h4>Standings</h4>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>W</th>
              <th>L</th>
              <th>D</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {standingsArray.map((standing, index) => (
              <tr key={standing.playerId}>
                <td>{index + 1}</td>
                <td>{getPlayerName(standing.playerId)}</td>
                <td className="wins">{standing.wins}</td>
                <td className="losses">{standing.losses}</td>
                <td className="draws">{standing.draws}</td>
                <td className="points">{standing.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderBracket = (tournament: Tournament) => {
    if (!tournament.brackets) return null;

    return (
      <div className="bracket">
        <h4>Bracket</h4>
        {tournament.brackets.rounds.map((round) => (
          <div key={round.roundNumber} className="bracket-round">
            <h5>Round {round.roundNumber}</h5>
            <div className="bracket-matches">
              {round.matches.map((match, idx) => (
                <div key={idx} className="bracket-match">
                  <div className="bracket-participant">
                    {match.participant1 ? getPlayerName(match.participant1) : 'TBD'}
                    {match.winner === match.participant1 && <span className="winner-indicator">✓</span>}
                  </div>
                  <div className="vs">vs</div>
                  <div className="bracket-participant">
                    {match.participant2 ? getPlayerName(match.participant2) : 'TBD'}
                    {match.winner === match.participant2 && <span className="winner-indicator">✓</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading tournaments...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={loadData}>Retry</button>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <div className="empty-state">
        <h2>Tournaments</h2>
        <p>No tournaments have been created yet.</p>
      </div>
    );
  }

  return (
    <div className="tournaments-container">
      <h2>Tournaments</h2>

      <div className="tournaments-grid">
        {tournaments.map((tournament) => (
          <div key={tournament.tournamentId} className="tournament-card">
            <div className="tournament-header">
              <h3>{tournament.name}</h3>
              {getStatusBadge(tournament.status)}
            </div>

            <div className="tournament-info">
              <p>
                <strong>Type:</strong>{' '}
                {tournament.type === 'single-elimination' ? 'Single Elimination' : 'Round Robin'}
              </p>
              <p>
                <strong>Participants:</strong> {tournament.participants.length}
              </p>
              {tournament.winner && (
                <p className="tournament-winner">
                  <strong>Winner:</strong> {getPlayerName(tournament.winner)}
                </p>
              )}
            </div>

            <button
              onClick={() => setSelectedTournament(tournament)}
              className="view-details-btn"
            >
              View Details
            </button>
          </div>
        ))}
      </div>

      {selectedTournament && (
        <div className="tournament-modal">
          <div className="tournament-content">
            <div className="modal-header">
              <h3>{selectedTournament.name}</h3>
              <button
                onClick={() => setSelectedTournament(null)}
                className="close-btn"
              >
                ×
              </button>
            </div>

            <div className="tournament-details">
              <p>
                <strong>Type:</strong>{' '}
                {selectedTournament.type === 'single-elimination' ? 'Single Elimination' : 'Round Robin'}
              </p>
              <p>
                <strong>Status:</strong> {selectedTournament.status}
              </p>
              <p>
                <strong>Participants:</strong>
              </p>
              <ul className="participants-list">
                {selectedTournament.participants.map((playerId) => (
                  <li key={playerId}>{getPlayerName(playerId)}</li>
                ))}
              </ul>
            </div>

            {selectedTournament.type === 'round-robin'
              ? renderRoundRobinStandings(selectedTournament)
              : renderBracket(selectedTournament)}
          </div>
        </div>
      )}
    </div>
  );
}
