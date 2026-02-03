import { useEffect, useState } from 'react';
import { championshipsApi, playersApi } from '../services/api';
import type { Championship, ChampionshipReign, Player } from '../types';
import './Championships.css';

export default function Championships() {
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedChampionship, setSelectedChampionship] = useState<string | null>(null);
  const [history, setHistory] = useState<ChampionshipReign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [champData, playerData] = await Promise.all([
        championshipsApi.getAll(),
        playersApi.getAll(),
      ]);
      setChampionships(champData);
      setPlayers(playerData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load championships');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (championshipId: string) => {
    try {
      setLoadingHistory(true);
      const historyData = await championshipsApi.getHistory(championshipId);
      setHistory(historyData);
      setSelectedChampionship(championshipId);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getPlayerName = (playerId: string | string[]) => {
    if (Array.isArray(playerId)) {
      return playerId.map(id => {
        const player = players.find(p => p.playerId === id);
        return player ? player.name : 'Unknown';
      }).join(' & ');
    }
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : 'Unknown';
  };

  if (loading) {
    return <div className="loading">Loading championships...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={loadData}>Retry</button>
      </div>
    );
  }

  if (championships.length === 0) {
    return (
      <div className="empty-state">
        <h2>Championships</h2>
        <p>No championships have been created yet.</p>
      </div>
    );
  }

  return (
    <div className="championships-container">
      <h2>Championships</h2>

      <div className="championships-grid">
        {championships.map((championship) => (
          <div key={championship.championshipId} className="championship-card">
            {championship.imageUrl ? (
              <div className="championship-image-container">
                <img
                  src={championship.imageUrl}
                  alt={championship.name}
                  className="championship-image"
                />
              </div>
            ) : (
              <div className="championship-image-placeholder">
                <span>No Image</span>
              </div>
            )}
            <div className="championship-header">
              <h3>{championship.name}</h3>
              <span className="championship-type">
                {championship.type === 'singles' ? 'Singles' : 'Tag Team'}
              </span>
            </div>

            <div className="current-champion">
              <label>Current Champion:</label>
              <p>
                {championship.currentChampion
                  ? getPlayerName(championship.currentChampion)
                  : 'Vacant'}
              </p>
            </div>

            <button
              onClick={() => loadHistory(championship.championshipId)}
              className="view-history-btn"
            >
              View Championship History
            </button>
          </div>
        ))}
      </div>

      {selectedChampionship && (
        <div className="history-modal">
          <div className="history-content">
            <div className="history-header">
              <h3>
                {championships.find(c => c.championshipId === selectedChampionship)?.name} History
              </h3>
              <button
                onClick={() => setSelectedChampionship(null)}
                className="close-btn"
              >
                ×
              </button>
            </div>

            {loadingHistory ? (
              <div className="loading">Loading history...</div>
            ) : history.length === 0 ? (
              <p>No championship history yet.</p>
            ) : (
              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Champion</th>
                      <th>Won Date</th>
                      <th>Lost Date</th>
                      <th>Days Held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((reign, index) => (
                      <tr key={index}>
                        <td className="champion-name">
                          {getPlayerName(reign.champion)}
                        </td>
                        <td>{new Date(reign.wonDate).toLocaleDateString()}</td>
                        <td>
                          {reign.lostDate
                            ? new Date(reign.lostDate).toLocaleDateString()
                            : 'Current'}
                        </td>
                        <td>
                          {reign.daysHeld !== undefined
                            ? `${reign.daysHeld} days`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
