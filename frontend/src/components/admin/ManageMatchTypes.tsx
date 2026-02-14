import { useState, useEffect, FormEvent } from 'react';
import { matchTypesApi } from '../../services/api';
import type { MatchType } from '../../types';
import './ManageMatchTypes.css';

export default function ManageMatchTypes() {
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMatchType, setEditingMatchType] = useState<MatchType | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    loadMatchTypes();
  }, []);

  const loadMatchTypes = async () => {
    try {
      setLoading(true);
      const data = await matchTypesApi.getAll();
      setMatchTypes(data);
    } catch (_err) {
      setError('Failed to load match types');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (editingMatchType) {
        await matchTypesApi.update(editingMatchType.matchTypeId, {
          name: formData.name,
          description: formData.description || undefined,
        });
        setSuccess('Match type updated successfully!');
      } else {
        await matchTypesApi.create({
          name: formData.name,
          description: formData.description || undefined,
        });
        setSuccess('Match type created successfully!');
      }

      setFormData({ name: '', description: '' });
      setShowAddForm(false);
      setEditingMatchType(null);
      await loadMatchTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save match type');
    }
  };

  const handleEdit = (matchType: MatchType) => {
    setEditingMatchType(matchType);
    setFormData({
      name: matchType.name,
      description: matchType.description || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (matchTypeId: string) => {
    if (!confirm('Are you sure you want to delete this match type?')) {
      return;
    }

    setDeleting(matchTypeId);
    setError(null);
    setSuccess(null);

    try {
      await matchTypesApi.delete(matchTypeId);
      setSuccess('Match type deleted successfully!');
      await loadMatchTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete match type');
    } finally {
      setDeleting(null);
    }
  };

  const handleCancel = () => {
    setFormData({ name: '', description: '' });
    setShowAddForm(false);
    setEditingMatchType(null);
  };

  if (loading) {
    return <div className="loading">Loading match types...</div>;
  }

  return (
    <div className="manage-match-types">
      <div className="match-types-header">
        <h2>Manage Match Types</h2>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)}>
            Create Match Type
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showAddForm && (
        <div className="match-type-form-container">
          <h3>{editingMatchType ? 'Edit Match Type' : 'Create New Match Type'}</h3>
          <form onSubmit={handleSubmit} className="match-type-form">
            <div className="form-group">
              <label htmlFor="name">Match Type Name</label>
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
                placeholder="Brief description of this match type"
                rows={3}
              />
            </div>

            <div className="form-actions">
              <button type="submit">
                {editingMatchType ? 'Update Match Type' : 'Create Match Type'}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="match-types-list">
        <h3>All Match Types ({matchTypes.length})</h3>
        {matchTypes.length === 0 ? (
          <p>No match types yet. Create your first match type to define stipulations!</p>
        ) : (
          <div className="match-types-grid">
            {matchTypes.map(matchType => (
              <div key={matchType.matchTypeId} className="match-type-card">
                <h4>{matchType.name}</h4>
                {matchType.description && (
                  <p className="match-type-description">{matchType.description}</p>
                )}
                <div className="match-type-actions">
                  <button
                    onClick={() => handleEdit(matchType)}
                    className="match-type-edit-btn"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(matchType.matchTypeId)}
                    className="match-type-delete-btn"
                    disabled={deleting === matchType.matchTypeId}
                  >
                    {deleting === matchType.matchTypeId ? 'Deleting...' : 'Delete'}
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
