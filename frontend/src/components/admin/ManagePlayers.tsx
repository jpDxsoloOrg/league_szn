import { useState, useEffect, FormEvent } from 'react';
import { playersApi } from '../../services/api';
import type { Player } from '../../types';
import './ManagePlayers.css';

export default function ManagePlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    currentWrestler: '',
  });

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const data = await playersApi.getAll();
      setPlayers(data);
    } catch (err) {
      setError('Failed to load players');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (editingPlayer) {
        await playersApi.update(editingPlayer.playerId, formData);
      } else {
        await playersApi.create({
          name: formData.name,
          currentWrestler: formData.currentWrestler,
          wins: 0,
          losses: 0,
          draws: 0,
        });
      }

      setFormData({ name: '', currentWrestler: '' });
      setShowAddForm(false);
      setEditingPlayer(null);
      await loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save player');
    }
  };

  const handleEdit = (player: Player) => {
    setEditingPlayer(player);
    setFormData({
      name: player.name,
      currentWrestler: player.currentWrestler,
    });
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setFormData({ name: '', currentWrestler: '' });
    setShowAddForm(false);
    setEditingPlayer(null);
  };

  if (loading) {
    return <div className="loading">Loading players...</div>;
  }

  return (
    <div className="manage-players">
      <div className="players-header">
        <h2>Manage Players</h2>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)}>
            Add New Player
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {showAddForm && (
        <div className="player-form-container">
          <h3>{editingPlayer ? 'Edit Player' : 'Add New Player'}</h3>
          <form onSubmit={handleSubmit} className="player-form">
            <div className="form-group">
              <label htmlFor="name">Player Name</label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="John Doe"
              />
            </div>

            <div className="form-group">
              <label htmlFor="wrestler">Wrestler</label>
              <input
                type="text"
                id="wrestler"
                value={formData.currentWrestler}
                onChange={(e) => setFormData({ ...formData, currentWrestler: e.target.value })}
                required
                placeholder="Stone Cold Steve Austin"
              />
            </div>

            <div className="form-actions">
              <button type="submit">
                {editingPlayer ? 'Update Player' : 'Add Player'}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="players-list">
        <h3>All Players ({players.length})</h3>
        {players.length === 0 ? (
          <p>No players yet. Add your first player!</p>
        ) : (
          <table className="players-table">
            <thead>
              <tr>
                <th>Player Name</th>
                <th>Wrestler</th>
                <th>Record</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.playerId}>
                  <td>{player.name}</td>
                  <td>{player.currentWrestler}</td>
                  <td>
                    <span className="record">
                      {player.wins}W - {player.losses}L - {player.draws}D
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleEdit(player)}
                      className="edit-btn"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
