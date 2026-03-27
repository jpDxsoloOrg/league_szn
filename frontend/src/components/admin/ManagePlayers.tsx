import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { playersApi, imagesApi, divisionsApi } from '../../services/api';
import { sanitizeName } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import { FILE_UPLOAD_LIMITS, VALIDATION } from '../../constants';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import type { Player, Division } from '../../types';
import './ManagePlayers.css';

export default function ManagePlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    currentWrestler: '',
    alternateWrestler: '',
    imageUrl: '',
    divisionId: '',
    psnId: '',
  });

  // Image upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [playersData, divisionsData] = await Promise.all([
        playersApi.getAll(),
        divisionsApi.getAll(),
      ]);
      setPlayers(playersData);
      setDivisions(divisionsData);
    } catch (_err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const getDivisionName = (divisionId?: string) => {
    if (!divisionId) return 'None';
    const division = divisions.find(d => d.divisionId === divisionId);
    return division?.name || 'Unknown';
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
    setFormData(prev => ({ ...prev, imageUrl: '' }));
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
          'wrestlers'
        );
        uploadUrl = response.uploadUrl;
        imageUrl = response.imageUrl;
      } catch (err) {
        logger.error('Failed to get upload URL for player image');
        if (err instanceof Error && err.message.includes('401')) {
          throw new Error('Session expired. Please log in again to upload images.');
        }
        throw new Error('Unable to prepare image upload. Please check your connection and try again.');
      }

      // Upload to S3 with specific error handling
      try {
        await imagesApi.uploadToS3(uploadUrl, selectedFile);
      } catch (err) {
        logger.error('Failed to upload player image to storage');
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
    setSubmitting(true);

    try {
      // Upload image first if one is selected
      const imageUrl = await uploadImage();

      // Sanitize inputs before sending to API
      const sanitizedName = sanitizeName(formData.name, VALIDATION.MAX_NAME_LENGTH);
      const sanitizedWrestler = sanitizeName(formData.currentWrestler, VALIDATION.MAX_NAME_LENGTH);

      if (!sanitizedName || !sanitizedWrestler) {
        setError('Name and wrestler fields cannot be empty');
        return;
      }

      if (editingPlayer) {
        await playersApi.update(editingPlayer.playerId, {
          name: sanitizedName,
          currentWrestler: sanitizedWrestler,
          alternateWrestler: formData.alternateWrestler.trim() || undefined,
          imageUrl: imageUrl || undefined,
          divisionId: formData.divisionId || undefined,
          psnId: formData.psnId.trim() || undefined,
        });
      } else {
        await playersApi.create({
          name: sanitizedName,
          currentWrestler: sanitizedWrestler,
          alternateWrestler: formData.alternateWrestler.trim() || undefined,
          imageUrl: imageUrl || undefined,
          divisionId: formData.divisionId || undefined,
          psnId: formData.psnId.trim() || undefined,
          wins: 0,
          losses: 0,
          draws: 0,
        });
      }

      setFormData({ name: '', currentWrestler: '', alternateWrestler: '', imageUrl: '', divisionId: '', psnId: '' });
      setSelectedFile(null);
      setImagePreview(null);
      setShowAddForm(false);
      setEditingPlayer(null);
      setSuccess(editingPlayer ? 'Player updated successfully!' : 'Player created successfully!');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save player');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (player: Player) => {
    setEditingPlayer(player);
    setFormData({
      name: player.name,
      currentWrestler: player.currentWrestler,
      alternateWrestler: player.alternateWrestler || '',
      imageUrl: player.imageUrl || '',
      divisionId: player.divisionId || '',
      psnId: player.psnId || '',
    });
    setImagePreview(player.imageUrl || null);
    setSelectedFile(null);
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setFormData({ name: '', currentWrestler: '', alternateWrestler: '', imageUrl: '', divisionId: '', psnId: '' });
    setSelectedFile(null);
    setImagePreview(null);
    setShowAddForm(false);
    setEditingPlayer(null);
  };

  const handleDelete = async (playerId: string, playerName: string) => {
    if (!confirm(`Are you sure you want to delete ${playerName}? This action cannot be undone.`)) {
      return;
    }

    setDeleting(playerId);
    setError(null);
    setSuccess(null);

    try {
      await playersApi.delete(playerId);
      setSuccess('Player deleted successfully!');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete player');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return <div className="loading">Loading players...</div>;
  }

  return (
    <div className="manage-players">
      <div className="players-header">
        <div>
          <h2>Manage Players</h2>
          <p className="players-subtext">
            Edit existing players, assign divisions, and keep wrestler profiles current. Need process
            details? <Link to="/guide/wiki/admin-manage-players">Learn more</Link>.
          </p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

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

            <div className="form-group">
              <label htmlFor="alternateWrestler">Alternate Wrestler</label>
              <input
                type="text"
                id="alternateWrestler"
                value={formData.alternateWrestler}
                onChange={(e) => setFormData({ ...formData, alternateWrestler: e.target.value })}
                placeholder="Backup wrestler (optional)"
              />
            </div>

            <div className="form-group">
              <label htmlFor="division">Division</label>
              <select
                id="division"
                value={formData.divisionId}
                onChange={(e) => setFormData({ ...formData, divisionId: e.target.value })}
              >
                <option value="">No Division</option>
                {divisions.map((division) => (
                  <option key={division.divisionId} value={division.divisionId}>
                    {division.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="psnId">PSN ID</label>
              <input
                type="text"
                id="psnId"
                value={formData.psnId}
                onChange={(e) => setFormData({ ...formData, psnId: e.target.value })}
                placeholder="PlayStation Network ID"
              />
            </div>

            <div className="form-group">
              <label htmlFor="image">Wrestler Image</label>
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
                      id="image"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleFileSelect}
                      className="file-input"
                    />
                    <label htmlFor="image" className="file-input-label">
                      Click to upload image
                    </label>
                    <p className="upload-hint">{FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS} (max {FILE_UPLOAD_LIMITS.MAX_SIZE_MB}MB)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={submitting || uploading}>
                {submitting ? 'Saving...' : uploading ? 'Uploading...' : editingPlayer ? 'Update Player' : 'Add Player'}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn" disabled={submitting || uploading}>
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
          <div className="players-table-wrapper">
          <table className="players-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Player Name</th>
                <th>Wrestler</th>
                <th>Alt. Wrestler</th>
                <th>PSN</th>
                <th>Division</th>
                <th>Record</th>
                <th>Linked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.playerId}>
                  <td>
                    <img
                      src={resolveImageSrc(player.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                      onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                      alt={player.currentWrestler}
                      className="player-thumbnail"
                    />
                  </td>
                  <td>{player.name}</td>
                  <td>{player.currentWrestler}</td>
                  <td>{player.alternateWrestler || '-'}</td>
                  <td>{player.psnId || '-'}</td>
                  <td className="division-cell">{getDivisionName(player.divisionId)}</td>
                  <td>
                    <span className="record">
                      {player.wins}W - {player.losses}L - {player.draws}D
                    </span>
                  </td>
                  <td>
                    {player.userId ? (
                      <span className="linked-badge" title="This player is linked to a user account">
                        Linked
                      </span>
                    ) : (
                      <span className="unlinked-badge" title="This player was created manually and is not linked to a user account">
                        Manual
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button
                        onClick={() => handleEdit(player)}
                        className="edit-btn"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(player.playerId, player.name)}
                        className="delete-btn"
                        disabled={deleting === player.playerId}
                      >
                        {deleting === player.playerId ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
