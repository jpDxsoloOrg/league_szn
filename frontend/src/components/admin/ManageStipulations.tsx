import { useState, useEffect, FormEvent } from 'react';
import { stipulationsApi } from '../../services/api';
import type { Stipulation } from '../../types';
import './ManageStipulations.css';

export default function ManageStipulations() {
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingStipulation, setEditingStipulation] = useState<Stipulation | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    loadStipulations();
  }, []);

  const loadStipulations = async () => {
    try {
      setLoading(true);
      const data = await stipulationsApi.getAll();
      setStipulations(data);
    } catch (_err) {
      setError('Failed to load stipulations');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (editingStipulation) {
        await stipulationsApi.update(editingStipulation.stipulationId, {
          name: formData.name,
          description: formData.description || undefined,
        });
        setSuccess('Stipulation updated successfully!');
      } else {
        await stipulationsApi.create({
          name: formData.name,
          description: formData.description || undefined,
        });
        setSuccess('Stipulation created successfully!');
      }

      setFormData({ name: '', description: '' });
      setShowAddForm(false);
      setEditingStipulation(null);
      await loadStipulations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stipulation');
    }
  };

  const handleEdit = (stipulation: Stipulation) => {
    setEditingStipulation(stipulation);
    setFormData({
      name: stipulation.name,
      description: stipulation.description || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (stipulationId: string) => {
    if (!confirm('Are you sure you want to delete this stipulation?')) {
      return;
    }

    setDeleting(stipulationId);
    setError(null);
    setSuccess(null);

    try {
      await stipulationsApi.delete(stipulationId);
      setSuccess('Stipulation deleted successfully!');
      await loadStipulations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete stipulation');
    } finally {
      setDeleting(null);
    }
  };

  const handleCancel = () => {
    setFormData({ name: '', description: '' });
    setShowAddForm(false);
    setEditingStipulation(null);
  };

  if (loading) {
    return <div className="loading">Loading stipulations...</div>;
  }

  return (
    <div className="manage-stipulations">
      <div className="stipulations-header">
        <h2>Manage Stipulations</h2>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)}>
            Create Stipulation
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showAddForm && (
        <div className="stipulation-form-container">
          <h3>{editingStipulation ? 'Edit Stipulation' : 'Create New Stipulation'}</h3>
          <form onSubmit={handleSubmit} className="stipulation-form">
            <div className="form-group">
              <label htmlFor="name">Stipulation Name</label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., Ladder Match, Steel Cage, Hell in a Cell"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description (Optional)</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this stipulation"
                rows={3}
              />
            </div>

            <div className="form-actions">
              <button type="submit">
                {editingStipulation ? 'Update Stipulation' : 'Create Stipulation'}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="stipulations-list">
        <h3>All Stipulations ({stipulations.length})</h3>
        {stipulations.length === 0 ? (
          <p>No stipulations yet. Create your first stipulation!</p>
        ) : (
          <div className="stipulations-grid">
            {stipulations.map(stipulation => (
              <div key={stipulation.stipulationId} className="stipulation-card">
                <h4>{stipulation.name}</h4>
                {stipulation.description && (
                  <p className="stipulation-description">{stipulation.description}</p>
                )}
                <div className="stipulation-actions">
                  <button
                    onClick={() => handleEdit(stipulation)}
                    className="stipulation-edit-btn"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(stipulation.stipulationId)}
                    className="stipulation-delete-btn"
                    disabled={deleting === stipulation.stipulationId}
                  >
                    {deleting === stipulation.stipulationId ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
