import { useState, useEffect, FormEvent } from 'react';
import { tournamentsApi, playersApi } from '../../services/api';
import { sanitizeName } from '../../utils/sanitize';
import type { Player } from '../../types';
import './CreateTournament.css';

export default function CreateTournament() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'single-elimination' as 'single-elimination' | 'round-robin',
    participants: [] as string[],
  });

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const data = await playersApi.getAll();
      setPlayers(data);
    } catch (_err) {
      setError('Failed to load players');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return; // Prevent double submission

    setError(null);
    setSuccess(null);

    if (formData.participants.length < 2) {
      setError('Please select at least 2 participants');
      return;
    }

    if (formData.type === 'single-elimination' && formData.participants.length < 4) {
      setError('Single elimination tournaments require at least 4 participants');
      return;
    }

    setSubmitting(true);

    try {
      // Sanitize tournament name input
      const sanitizedName = sanitizeName(formData.name, 100);

      if (!sanitizedName) {
        setError('Tournament name cannot be empty');
        setSubmitting(false);
        return;
      }

      await tournamentsApi.create({
        name: sanitizedName,
        type: formData.type,
        participants: formData.participants,
        status: 'upcoming',
      });

      setSuccess('Tournament created successfully!');
      setFormData({
        name: '',
        type: 'single-elimination',
        participants: [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
    } finally {
      setSubmitting(false);
    }
  };

  const handleParticipantToggle = (playerId: string) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.includes(playerId)
        ? prev.participants.filter(id => id !== playerId)
        : [...prev.participants, playerId],
    }));
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="create-tournament">
      <h2>Create Tournament</h2>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit} className="tournament-form">
        <div className="form-group">
          <label htmlFor="name">Tournament Name</label>
          <input
            type="text"
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="King of the Ring 2024"
          />
        </div>

        <div className="form-group">
          <label htmlFor="type">Tournament Type</label>
          <select
            id="type"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value as 'single-elimination' | 'round-robin' })}
            required
          >
            <option value="single-elimination">Single Elimination</option>
            <option value="round-robin">Round Robin (G1 Climax Style)</option>
          </select>
          <small className="help-text">
            {formData.type === 'single-elimination'
              ? 'Bracket-style tournament. Requires at least 4 participants.'
              : 'Every participant faces every other participant. 2 points for win, 1 for draw.'}
          </small>
        </div>

        <div className="form-group">
          <label>Participants (Selected: {formData.participants.length})</label>
          <div className="participants-grid">
            {players.map(player => (
              <div
                key={player.playerId}
                className={`participant-card ${formData.participants.includes(player.playerId) ? 'selected' : ''}`}
                onClick={() => handleParticipantToggle(player.playerId)}
              >
                <div className="participant-name">{player.name}</div>
                <div className="participant-wrestler">{player.currentWrestler}</div>
                <div className="participant-record">
                  {player.wins}W-{player.losses}L-{player.draws}D
                </div>
              </div>
            ))}
          </div>
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Tournament'}
        </button>
      </form>
    </div>
  );
}
