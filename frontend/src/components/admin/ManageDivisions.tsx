import { useState, useEffect, FormEvent } from 'react';
import { divisionsApi } from '../../services/api';
import type { Division } from '../../types';
import './ManageDivisions.css';

export default function ManageDivisions() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    loadDivisions();
  }, []);

  const loadDivisions = async () => {
    try {
      setLoading(true);
      const data = await divisionsApi.getAll();
      setDivisions(data);
    } catch (err) {
      setError('Failed to load divisions');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (editingDivision) {
        await divisionsApi.update(editingDivision.divisionId, {
          name: formData.name,
          description: formData.description || undefined,
        });
        setSuccess('Division updated successfully!');
      } else {
        await divisionsApi.create({
          name: formData.name,
          description: formData.description || undefined,
        });
        setSuccess('Division created successfully!');
      }

      setFormData({ name: '', description: '' });
      setShowAddForm(false);
      setEditingDivision(null);
      await loadDivisions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save division');
    }
  };

  const handleEdit = (division: Division) => {
    setEditingDivision(division);
    setFormData({
      name: division.name,
      description: division.description || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (divisionId: string) => {
    if (!confirm('Are you sure you want to delete this division?')) {
      return;
    }

    setDeleting(divisionId);
    setError(null);
    setSuccess(null);

    try {
      await divisionsApi.delete(divisionId);
      setSuccess('Division deleted successfully!');
      await loadDivisions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete division');
    } finally {
      setDeleting(null);
    }
  };

  const handleCancel = () => {
    setFormData({ name: '', description: '' });
    setShowAddForm(false);
    setEditingDivision(null);
  };

  if (loading) {
    return <div className="loading">Loading divisions...</div>;
  }

  return (
    <div className="manage-divisions">
      <div className="divisions-header">
        <h2>Manage Divisions</h2>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)}>
            Create Division
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showAddForm && (
        <div className="division-form-container">
          <h3>{editingDivision ? 'Edit Division' : 'Create New Division'}</h3>
          <form onSubmit={handleSubmit} className="division-form">
            <div className="form-group">
              <label htmlFor="name">Division Name</label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., Raw, SmackDown, NXT"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description (Optional)</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this division"
                rows={3}
              />
            </div>

            <div className="form-actions">
              <button type="submit">
                {editingDivision ? 'Update Division' : 'Create Division'}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="divisions-list">
        <h3>All Divisions ({divisions.length})</h3>
        {divisions.length === 0 ? (
          <p>No divisions yet. Create your first division to group players!</p>
        ) : (
          <div className="divisions-grid">
            {divisions.map(division => (
              <div key={division.divisionId} className="division-card">
                <h4>{division.name}</h4>
                {division.description && (
                  <p className="division-description">{division.description}</p>
                )}
                <div className="division-actions">
                  <button
                    onClick={() => handleEdit(division)}
                    className="division-edit-btn"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(division.divisionId)}
                    className="division-delete-btn"
                    disabled={deleting === division.divisionId}
                  >
                    {deleting === division.divisionId ? 'Deleting...' : 'Delete'}
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
