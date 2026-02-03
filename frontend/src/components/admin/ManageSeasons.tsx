import { useState, useEffect, FormEvent } from 'react';
import { seasonsApi } from '../../services/api';
import type { Season } from '../../types';
import './ManageSeasons.css';

export default function ManageSeasons() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    loadSeasons();
  }, []);

  const loadSeasons = async () => {
    try {
      setLoading(true);
      const data = await seasonsApi.getAll();
      setSeasons(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load seasons');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.name || !formData.startDate) {
      setError('Season name and start date are required');
      return;
    }

    try {
      await seasonsApi.create({
        name: formData.name,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : undefined,
      });

      setSuccess('Season created successfully!');
      setFormData({ name: '', startDate: '', endDate: '' });
      setShowForm(false);
      loadSeasons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create season');
    }
  };

  const handleEndSeason = async (seasonId: string) => {
    if (!confirm('Are you sure you want to end this season? This will mark it as completed.')) {
      return;
    }

    try {
      setError(null);
      await seasonsApi.update(seasonId, { status: 'completed' });
      setSuccess('Season ended successfully!');
      loadSeasons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end season');
    }
  };

  const getActiveSeason = () => seasons.find(s => s.status === 'active');

  if (loading) {
    return <div className="loading">Loading seasons...</div>;
  }

  const activeSeason = getActiveSeason();

  return (
    <div className="manage-seasons">
      <div className="seasons-header">
        <h2>Manage Seasons</h2>
        {!activeSeason && (
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Create New Season'}
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showForm && (
        <div className="season-form-container">
          <h3>Create New Season</h3>
          <form onSubmit={handleSubmit} className="season-form">
            <div className="form-group">
              <label htmlFor="name">Season Name</label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Season 1, Spring 2024"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="startDate">Start Date</label>
                <input
                  type="date"
                  id="startDate"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="endDate">End Date (Optional)</label>
                <input
                  type="date"
                  id="endDate"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <button type="submit">Create Season</button>
          </form>
        </div>
      )}

      {activeSeason && (
        <div className="active-season-banner">
          <div className="active-season-info">
            <span className="status-badge active">Active Season</span>
            <h3>{activeSeason.name}</h3>
            <p>Started: {new Date(activeSeason.startDate).toLocaleDateString()}</p>
          </div>
          <button className="end-season-btn" onClick={() => handleEndSeason(activeSeason.seasonId)}>
            End Season
          </button>
        </div>
      )}

      <div className="seasons-list">
        <h3>All Seasons</h3>
        {seasons.length === 0 ? (
          <p className="empty-state">No seasons have been created yet.</p>
        ) : (
          <div className="seasons-grid">
            {seasons.map((season) => (
              <div key={season.seasonId} className={`season-card ${season.status === 'active' ? 'active' : ''}`}>
                <div className="season-card-header">
                  <h4>{season.name}</h4>
                  <span className={`status-badge ${season.status}`}>
                    {season.status === 'active' ? 'Active' : 'Completed'}
                  </span>
                </div>
                <div className="season-dates">
                  <p><strong>Start:</strong> {new Date(season.startDate).toLocaleDateString()}</p>
                  {season.endDate && (
                    <p><strong>End:</strong> {new Date(season.endDate).toLocaleDateString()}</p>
                  )}
                </div>
                {season.status === 'active' && (
                  <div className="season-actions">
                    <button className="end-season-btn small" onClick={() => handleEndSeason(season.seasonId)}>
                      End Season
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
