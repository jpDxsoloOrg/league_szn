import { useState, useEffect, FormEvent } from 'react';
import { championshipsApi } from '../../services/api';
import type { Championship } from '../../types';
import './ManageChampionships.css';

export default function ManageChampionships() {
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    type: 'singles' as 'singles' | 'tag',
  });

  useEffect(() => {
    loadChampionships();
  }, []);

  const loadChampionships = async () => {
    try {
      setLoading(true);
      const data = await championshipsApi.getAll();
      setChampionships(data);
    } catch (err) {
      setError('Failed to load championships');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      await championshipsApi.create({
        name: formData.name,
        type: formData.type,
        isActive: true,
      });

      setSuccess('Championship created successfully!');
      setFormData({ name: '', type: 'singles' });
      setShowAddForm(false);
      await loadChampionships();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create championship');
    }
  };

  if (loading) {
    return <div className="loading">Loading championships...</div>;
  }

  return (
    <div className="manage-championships">
      <div className="championships-header">
        <h2>Manage Championships</h2>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)}>
            Create Championship
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showAddForm && (
        <div className="championship-form-container">
          <h3>Create New Championship</h3>
          <form onSubmit={handleSubmit} className="championship-form">
            <div className="form-group">
              <label htmlFor="name">Championship Name</label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="World Heavyweight Championship"
              />
            </div>

            <div className="form-group">
              <label htmlFor="type">Type</label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'singles' | 'tag' })}
                required
              >
                <option value="singles">Singles</option>
                <option value="tag">Tag Team</option>
              </select>
            </div>

            <div className="form-actions">
              <button type="submit">Create Championship</button>
              <button type="button" onClick={() => setShowAddForm(false)} className="cancel-btn">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="championships-list">
        <h3>All Championships ({championships.length})</h3>
        {championships.length === 0 ? (
          <p>No championships yet. Create your first championship!</p>
        ) : (
          <div className="championships-grid">
            {championships.map(championship => (
              <div key={championship.championshipId} className="championship-card">
                <h4>{championship.name}</h4>
                <div className="championship-type">
                  {championship.type === 'singles' ? 'Singles' : 'Tag Team'}
                </div>
                <div className="championship-status">
                  {championship.isActive ? (
                    <span className="status-active">Active</span>
                  ) : (
                    <span className="status-inactive">Inactive</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
