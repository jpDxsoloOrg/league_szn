import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { championshipsApi, divisionsApi, playersApi, imagesApi } from '../../services/api';
import { sanitizeName } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import { FILE_UPLOAD_LIMITS, VALIDATION } from '../../constants';
import {
  DEFAULT_CHAMPIONSHIP_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import type { Championship, Division, Player } from '../../types';
import './ManageChampionships.css';

export default function ManageChampionships() {
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingChampionship, setEditingChampionship] = useState<Championship | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [vacating, setVacating] = useState<string | null>(null);

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    type: 'singles' as 'singles' | 'tag',
    divisionId: '',
    imageUrl: '',
  });

  // Image upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    loadChampionships();
    loadDivisions();
    loadPlayers();
  }, []);

  const loadChampionships = async () => {
    try {
      setLoading(true);
      const data = await championshipsApi.getAll();
      setChampionships(data);
    } catch (_err) {
      setError('Failed to load championships');
    } finally {
      setLoading(false);
    }
  };

  const loadDivisions = async () => {
    try {
      const data = await divisionsApi.getAll();
      setDivisions(data);
    } catch (_err) {
      // Non-critical — divisions are optional
    }
  };

  const loadPlayers = async () => {
    try {
      const data = await playersApi.getAll();
      setPlayers(data);
    } catch (_err) {
      // Non-critical — used for champion display
    }
  };

  const getChampionName = (currentChampion?: string | string[]): string => {
    if (!currentChampion) return 'Vacant';
    const ids = Array.isArray(currentChampion) ? currentChampion : [currentChampion];
    const names = ids.map(id => {
      const player = players.find(p => p.playerId === id);
      return player ? player.name : 'Unknown';
    });
    return names.join(' & ');
  };

  const getDivisionName = (divisionId?: string) => {
    if (!divisionId) return 'None';
    const division = divisions.find((d) => d.divisionId === divisionId);
    return division ? division.name : 'Unknown';
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!FILE_UPLOAD_LIMITS.ALLOWED_TYPES.includes(file.type as typeof FILE_UPLOAD_LIMITS.ALLOWED_TYPES[number])) {
        setError(`Invalid file type. Only ${FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS} images are allowed.`);
        return;
      }

      // Validate file size
      if (file.size > FILE_UPLOAD_LIMITS.MAX_SIZE) {
        setError(`File too large. Maximum size is ${FILE_UPLOAD_LIMITS.MAX_SIZE_MB}MB.`);
        return;
      }

      setSelectedFile(file);
      setError(null);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setFormData({ ...formData, imageUrl: '' });
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!selectedFile) return formData.imageUrl || null;

    try {
      setUploading(true);

      // Get presigned URL with specific error handling
      let uploadUrl: string;
      let imageUrl: string;
      try {
        const response = await imagesApi.generateUploadUrl(
          selectedFile.name,
          selectedFile.type,
          'championships'
        );
        uploadUrl = response.uploadUrl;
        imageUrl = response.imageUrl;
      } catch (err) {
        logger.error('Failed to get upload URL for championship image');
        if (err instanceof Error && err.message.includes('401')) {
          throw new Error('Session expired. Please log in again to upload images.');
        }
        throw new Error('Unable to prepare image upload. Please check your connection and try again.');
      }

      // Upload to S3 with specific error handling
      try {
        await imagesApi.uploadToS3(uploadUrl, selectedFile);
      } catch (err) {
        logger.error('Failed to upload championship image to storage');
        if (err instanceof TypeError && err.message.includes('network')) {
          throw new Error('Network error during upload. Please check your internet connection and try again.');
        }
        throw new Error('Failed to upload image to storage. Please try again or use a different image.');
      }

      return imageUrl;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || uploading) return; // Prevent double submission

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      // Sanitize inputs before sending to API
      const sanitizedName = sanitizeName(formData.name, VALIDATION.MAX_NAME_LENGTH);

      if (!sanitizedName) {
        setError('Championship name cannot be empty');
        return;
      }

      // Upload image first if one is selected
      const imageUrl = await uploadImage();

      if (editingChampionship) {
        await championshipsApi.update(editingChampionship.championshipId, {
          name: sanitizedName,
          type: formData.type,
          divisionId: formData.divisionId || undefined,
          imageUrl: imageUrl || undefined,
        });
        setSuccess('Championship updated successfully!');
      } else {
        await championshipsApi.create({
          name: sanitizedName,
          type: formData.type,
          divisionId: formData.divisionId || undefined,
          imageUrl: imageUrl || undefined,
          isActive: true,
        });
        setSuccess('Championship created successfully!');
      }

      setFormData({ name: '', type: 'singles', divisionId: '', imageUrl: '' });
      setSelectedFile(null);
      setImagePreview(null);
      setShowAddForm(false);
      setEditingChampionship(null);
      await loadChampionships();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save championship');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (championship: Championship) => {
    setEditingChampionship(championship);
    setFormData({
      name: championship.name,
      type: championship.type,
      divisionId: championship.divisionId || '',
      imageUrl: championship.imageUrl || '',
    });
    setImagePreview(championship.imageUrl || null);
    setSelectedFile(null);
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setFormData({ name: '', type: 'singles', divisionId: '', imageUrl: '' });
    setSelectedFile(null);
    setImagePreview(null);
    setShowAddForm(false);
    setEditingChampionship(null);
  };

  const handleDelete = async (championshipId: string, championshipName: string) => {
    if (!confirm(`Are you sure you want to delete "${championshipName}"? This will also delete all championship history. This action cannot be undone.`)) {
      return;
    }

    setDeleting(championshipId);
    setError(null);
    setSuccess(null);

    try {
      await championshipsApi.delete(championshipId);
      setSuccess('Championship deleted successfully!');
      await loadChampionships();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete championship');
    } finally {
      setDeleting(null);
    }
  };

  const handleVacate = async (championshipId: string, championshipName: string) => {
    if (!confirm(`Are you sure you want to vacate "${championshipName}"? The current champion will be stripped of the title.`)) {
      return;
    }

    setVacating(championshipId);
    setError(null);
    setSuccess(null);

    try {
      await championshipsApi.vacate(championshipId);
      setSuccess('Championship vacated successfully!');
      await loadChampionships();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to vacate championship');
    } finally {
      setVacating(null);
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
          <h3>{editingChampionship ? 'Edit Championship' : 'Create New Championship'}</h3>
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

            <div className="form-group">
              <label htmlFor="divisionId">Division (locks contenders to this division)</label>
              <select
                id="divisionId"
                value={formData.divisionId}
                onChange={(e) => setFormData({ ...formData, divisionId: e.target.value })}
              >
                <option value="">No Division (Open to all)</option>
                {divisions.map((division) => (
                  <option key={division.divisionId} value={division.divisionId}>
                    {division.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="championship-image">Championship Belt Image</label>
              <div className="image-upload-container">
                {imagePreview ? (
                  <div className="image-preview">
                    <img src={imagePreview} alt="Preview" />
                    <button type="button" onClick={clearImage} className="remove-image-btn">
                      Remove Image
                    </button>
                  </div>
                ) : (
                  <div className="image-upload-box">
                    <input
                      type="file"
                      id="championship-image"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleFileSelect}
                      className="file-input"
                    />
                    <label htmlFor="championship-image" className="file-input-label">
                      Click to upload image
                    </label>
                    <p className="upload-hint">{FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS} (max {FILE_UPLOAD_LIMITS.MAX_SIZE_MB}MB)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={submitting || uploading}>
                {submitting ? 'Saving...' : uploading ? 'Uploading...' : editingChampionship ? 'Update Championship' : 'Create Championship'}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn" disabled={submitting || uploading}>
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
                <img
                  src={resolveImageSrc(championship.imageUrl, DEFAULT_CHAMPIONSHIP_IMAGE)}
                  onError={(event) => applyImageFallback(event, DEFAULT_CHAMPIONSHIP_IMAGE)}
                  alt={championship.name}
                  className="championship-image"
                />
                <h4>{championship.name}</h4>
                <div className="championship-type">
                  {championship.type === 'singles' ? 'Singles' : 'Tag Team'}
                </div>
                <div className="championship-division">
                  Division: {getDivisionName(championship.divisionId)}
                </div>
                <div className="championship-champion">
                  Champion: {getChampionName(championship.currentChampion)}
                </div>
                <div className="championship-status">
                  {championship.isActive ? (
                    <span className="status-active">Active</span>
                  ) : (
                    <span className="status-inactive">Inactive</span>
                  )}
                </div>
                <div className="championship-actions">
                  <button
                    onClick={() => handleEdit(championship)}
                    className="championship-edit-btn"
                  >
                    Edit
                  </button>
                  {championship.currentChampion && (
                    <button
                      onClick={() => handleVacate(championship.championshipId, championship.name)}
                      className="championship-vacate-btn"
                      disabled={vacating === championship.championshipId}
                    >
                      {vacating === championship.championshipId ? 'Vacating...' : 'Vacate'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(championship.championshipId, championship.name)}
                    className="championship-delete-btn"
                    disabled={deleting === championship.championshipId}
                  >
                    {deleting === championship.championshipId ? 'Deleting...' : 'Delete'}
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
