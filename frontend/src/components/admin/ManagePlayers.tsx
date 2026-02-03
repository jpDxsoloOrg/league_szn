import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { playersApi, imagesApi } from '../../services/api';
import type { Player } from '../../types';
import './ManagePlayers.css';

export default function ManagePlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    currentWrestler: '',
    imageUrl: '',
  });

  // Image upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const data = await playersApi.getAll();
      setPlayers(data);
    } catch (err) {
      setError('Failed to load players');
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
        'wrestlers'
      );

      // Upload to S3
      await imagesApi.uploadToS3(uploadUrl, selectedFile);

      return imageUrl;
    } catch (err) {
      console.error('Error uploading image:', err);
      throw new Error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      // Upload image first if one is selected
      const imageUrl = await uploadImage();

      if (editingPlayer) {
        await playersApi.update(editingPlayer.playerId, {
          ...formData,
          imageUrl: imageUrl || undefined,
        });
      } else {
        await playersApi.create({
          name: formData.name,
          currentWrestler: formData.currentWrestler,
          imageUrl: imageUrl || undefined,
          wins: 0,
          losses: 0,
          draws: 0,
        });
      }

      setFormData({ name: '', currentWrestler: '', imageUrl: '' });
      setSelectedFile(null);
      setImagePreview(null);
      setShowAddForm(false);
      setEditingPlayer(null);
      await loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save player');
    }
  };

  const handleEdit = (player: Player) => {
    setEditingPlayer(player);
    setFormData({
      name: player.name,
      currentWrestler: player.currentWrestler,
      imageUrl: player.imageUrl || '',
    });
    setImagePreview(player.imageUrl || null);
    setSelectedFile(null);
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setFormData({ name: '', currentWrestler: '', imageUrl: '' });
    setSelectedFile(null);
    setImagePreview(null);
    setShowAddForm(false);
    setEditingPlayer(null);
  };

  if (loading) {
    return <div className="loading">Loading players...</div>;
  }

  return (
    <div className="manage-players">
      <div className="players-header">
        <h2>Manage Players</h2>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)}>
            Add New Player
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

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
                    <p className="upload-hint">JPEG, PNG, GIF, or WebP (max 5MB)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={uploading}>
                {uploading ? 'Uploading...' : editingPlayer ? 'Update Player' : 'Add Player'}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
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
          <table className="players-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Player Name</th>
                <th>Wrestler</th>
                <th>Record</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.playerId}>
                  <td>
                    {player.imageUrl ? (
                      <img
                        src={player.imageUrl}
                        alt={player.currentWrestler}
                        className="player-thumbnail"
                      />
                    ) : (
                      <div className="no-image">No Image</div>
                    )}
                  </td>
                  <td>{player.name}</td>
                  <td>{player.currentWrestler}</td>
                  <td>
                    <span className="record">
                      {player.wins}W - {player.losses}L - {player.draws}D
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleEdit(player)}
                      className="edit-btn"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
