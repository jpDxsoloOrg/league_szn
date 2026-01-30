import { useState, useEffect, FormEvent } from 'react';
import { matchesApi, playersApi, championshipsApi, tournamentsApi } from '../../services/api';
import type { Player, Championship, Tournament } from '../../types';
import './ScheduleMatch.css';

export default function ScheduleMatch() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: '',
    matchType: 'singles',
    stipulation: '',
    participants: [] as string[],
    isChampionship: false,
    championshipId: '',
    tournamentId: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [playersData, championshipsData, tournamentsData] = await Promise.all([
        playersApi.getAll(),
        championshipsApi.getAll(),
        tournamentsApi.getAll(),
      ]);
      setPlayers(playersData);
      setChampionships(championshipsData);
      setTournaments(tournamentsData.filter(t => t.status !== 'completed'));
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (formData.participants.length < 2) {
      setError('Please select at least 2 participants');
      return;
    }

    try {
      await matchesApi.schedule({
        date: new Date(formData.date).toISOString(),
        matchType: formData.matchType,
        stipulation: formData.stipulation,
        participants: formData.participants,
        isChampionship: formData.isChampionship,
        championshipId: formData.championshipId || undefined,
        tournamentId: formData.tournamentId || undefined,
        status: 'scheduled',
      });

      setSuccess('Match scheduled successfully!');
      setFormData({
        date: '',
        matchType: 'singles',
        stipulation: '',
        participants: [],
        isChampionship: false,
        championshipId: '',
        tournamentId: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule match');
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
    <div className="schedule-match">
      <h2>Schedule Match</h2>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit} className="match-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="date">Date & Time</label>
            <input
              type="datetime-local"
              id="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="matchType">Match Type</label>
            <select
              id="matchType"
              value={formData.matchType}
              onChange={(e) => setFormData({ ...formData, matchType: e.target.value })}
              required
            >
              <option value="singles">Singles</option>
              <option value="tag">Tag Team</option>
              <option value="triple-threat">Triple Threat</option>
              <option value="fatal-4-way">Fatal 4-Way</option>
              <option value="six-pack">Six Pack Challenge</option>
              <option value="battle-royal">Battle Royal</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="stipulation">Stipulation (Optional)</label>
          <input
            type="text"
            id="stipulation"
            value={formData.stipulation}
            onChange={(e) => setFormData({ ...formData, stipulation: e.target.value })}
            placeholder="e.g., Ladder Match, Steel Cage, Hell in a Cell"
          />
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.isChampionship}
              onChange={(e) => setFormData({ ...formData, isChampionship: e.target.checked, championshipId: '' })}
            />
            Championship Match
          </label>
        </div>

        {formData.isChampionship && (
          <div className="form-group">
            <label htmlFor="championship">Championship</label>
            <select
              id="championship"
              value={formData.championshipId}
              onChange={(e) => setFormData({ ...formData, championshipId: e.target.value })}
              required={formData.isChampionship}
            >
              <option value="">Select Championship</option>
              {championships.map(c => (
                <option key={c.championshipId} value={c.championshipId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {tournaments.length > 0 && (
          <div className="form-group">
            <label htmlFor="tournament">Tournament (Optional)</label>
            <select
              id="tournament"
              value={formData.tournamentId}
              onChange={(e) => setFormData({ ...formData, tournamentId: e.target.value })}
            >
              <option value="">None</option>
              {tournaments.map(t => (
                <option key={t.tournamentId} value={t.tournamentId}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label>Participants (Select {formData.matchType === 'singles' ? '2' : '2+'})</label>
          <div className="participants-grid">
            {players.map(player => (
              <div
                key={player.playerId}
                className={`participant-card ${formData.participants.includes(player.playerId) ? 'selected' : ''}`}
                onClick={() => handleParticipantToggle(player.playerId)}
              >
                <div className="participant-name">{player.name}</div>
                <div className="participant-wrestler">{player.currentWrestler}</div>
              </div>
            ))}
          </div>
          <div className="selected-count">
            Selected: {formData.participants.length}
          </div>
        </div>

        <button type="submit">Schedule Match</button>
      </form>
    </div>
  );
}
