import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { championshipsApi, imagesApi } from '../../services/api';
import { sanitizeName } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import type { Championship } from '../../types';
import './ManageChampionships.css';

export default function ManageChampionships() {
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingChampionship, setEditingChampionship] = useState<Championship | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'singles' as 'singles' | 'tag',
    imageUrl: '',
  });

  // Image upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    loadChampionships();
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

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setError('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('File too large. Maximum size is 5MB.');
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
      // Get presigned URL
      const { uploadUrl, imageUrl } = await imagesApi.generateUploadUrl(
        selectedFile.name,
        selectedFile.type,
        'championships'
      );

      // Upload to S3
      await imagesApi.uploadToS3(uploadUrl, selectedFile);

      return imageUrl;
    } catch (_err) {
      logger.error('Error uploading championship image');
      throw new Error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      // Sanitize inputs before sending to API
      const sanitizedName = sanitizeName(formData.name, 100);

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
          imageUrl: imageUrl || undefined,
        });
        setSuccess('Championship updated successfully!');
      } else {
        await championshipsApi.create({
          name: sanitizedName,
          type: formData.type,
          imageUrl: imageUrl || undefined,
          isActive: true,
        });
        setSuccess('Championship created successfully!');
      }

      setFormData({ name: '', type: 'singles', imageUrl: '' });
      setSelectedFile(null);
      setImagePreview(null);
      setShowAddForm(false);
      setEditingChampionship(null);
      await loadChampionships();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save championship');
    }
  };

  const handleEdit = (championship: Championship) => {
    setEditingChampionship(championship);
    setFormData({
      name: championship.name,
      type: championship.type,
      imageUrl: championship.imageUrl || '',
    });
    setImagePreview(championship.imageUrl || null);
    setSelectedFile(null);
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setFormData({ name: '', type: 'singles', imageUrl: '' });
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
                    <p className="upload-hint">JPEG, PNG, GIF, or WebP (max 5MB)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={uploading}>
                {uploading ? 'Uploading...' : editingChampionship ? 'Update Championship' : 'Create Championship'}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
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
                {championship.imageUrl ? (
                  <img
                    src={championship.imageUrl}
                    alt={championship.name}
                    className="championship-image"
                  />
                ) : (
                  <div className="championship-no-image">No Image</div>
                )}
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
                <div className="championship-actions">
                  <button
                    onClick={() => handleEdit(championship)}
                    className="championship-edit-btn"
                  >
                    Edit
                  </button>
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
