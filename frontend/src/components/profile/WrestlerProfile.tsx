import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { profileApi, imagesApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { sanitizeName } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import { FILE_UPLOAD_LIMITS, VALIDATION } from '../../constants';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import { useSiteConfig } from '../../contexts/SiteConfigContext'; 
import   EmbeddedPlayerStats   from "../statistics/EmbeddedPlayerStats";
import type { Player } from '../../types';
import './WrestlerProfile.css';

interface SeasonRecord {
  seasonId: string;
  seasonName: string;
  seasonStatus: string;
  wins: number;
  losses: number;
  draws: number;
}

interface PlayerProfile extends Player {
  seasonRecords?: SeasonRecord[];
}

export default function WrestlerProfile() {
  const { refreshProfile } = useAuth();
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { features } = useSiteConfig();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    currentWrestler: '',
    imageUrl: '',
    bio: '',
  });

  // Image upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const profile = await profileApi.getMyProfile();
      setPlayer(profile);
      setFormData({
        name: profile.name,
        currentWrestler: profile.currentWrestler,
        imageUrl: profile.imageUrl || '',
        bio: profile.bio || '',
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        setError('No player profile found. An admin needs to approve your wrestler request first.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!FILE_UPLOAD_LIMITS.ALLOWED_TYPES.includes(file.type as typeof FILE_UPLOAD_LIMITS.ALLOWED_TYPES[number])) {
        setError(`Invalid file type. Only ${FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS} images are allowed.`);
        return;
      }

      if (file.size > FILE_UPLOAD_LIMITS.MAX_SIZE) {
        setError(`File too large. Maximum size is ${FILE_UPLOAD_LIMITS.MAX_SIZE_MB}MB.`);
        return;
      }

      setSelectedFile(file);
      setError(null);

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
        logger.error('Failed to get upload URL for profile image');
        if (err instanceof Error && err.message.includes('401')) {
          throw new Error('Session expired. Please log in again to upload images.');
        }
        throw new Error('Unable to prepare image upload. Please check your connection and try again.');
      }

      try {
        await imagesApi.uploadToS3(uploadUrl, selectedFile);
      } catch (err) {
        logger.error('Failed to upload profile image to storage');
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

  const handleEdit = () => {
    if (player) {
      setFormData({
        name: player.name,
        currentWrestler: player.currentWrestler,
        imageUrl: player.imageUrl || '',
        bio: player.bio || '',
      });
      setImagePreview(player.imageUrl || null);
      setSelectedFile(null);
    }
    setEditing(true);
    setError(null);
    setSuccess(null);
  };

  const handleCancel = () => {
    setEditing(false);
    setSelectedFile(null);
    setImagePreview(null);
    setError(null);
    if (player) {
      setFormData({
        name: player.name,
        currentWrestler: player.currentWrestler,
        imageUrl: player.imageUrl || '',
        bio: player.bio || '',
      });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || uploading) return;

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const imageUrl = await uploadImage();

      const sanitizedName = sanitizeName(formData.name, VALIDATION.MAX_NAME_LENGTH);
      const sanitizedWrestler = sanitizeName(formData.currentWrestler, VALIDATION.MAX_NAME_LENGTH);

      if (!sanitizedName) {
        setError('Player name cannot be empty');
        return;
      }

      const updates: { name?: string; currentWrestler?: string; imageUrl?: string; bio?: string } = {
        name: sanitizedName,
      };

      if (sanitizedWrestler) {
        updates.currentWrestler = sanitizedWrestler;
      }

      if (imageUrl) {
        updates.imageUrl = imageUrl;
      }

      if (formData.bio.trim()) {
        updates.bio = formData.bio.trim();
      }

      const updated = await profileApi.updateMyProfile(updates);
      setPlayer(updated);
      setEditing(false);
      setSelectedFile(null);
      setImagePreview(null);
      setSuccess('Profile updated successfully!');
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSubmitting(false);
    }
  };

  const getWinPercentage = (wins: number, losses: number, draws: number): string => {
    const total = wins + losses + draws;
    if (total === 0) return '0';
    return ((wins / total) * 100).toFixed(1);
  };

  const getWinPercentageClass = (wins: number, losses: number, draws: number): string => {
    const total = wins + losses + draws;
    if (total === 0) return '';
    const pct = (wins / total) * 100;
    if (pct >= 60) return 'win-high';
    if (pct >= 40) return 'win-medium';
    return 'win-low';
  };

  if (loading) {
    return (
      <div className="wrestler-profile">
        <div className="loading-state">
          <div className="loading-spinner" role="status" aria-label="Loading profile"></div>
          <p className="loading-text">Loading Profile</p>
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="wrestler-profile">
        {error && <div className="error-message">{error}</div>}
        <div className="empty-state">
          <h3>No Profile Found</h3>
          <p>Your player profile has not been created yet. Contact an admin to get set up as a wrestler.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`wrestler-profile ${editing ? 'edit-mode' : 'view-mode'}`}>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-image-wrapper">
          <img
            src={resolveImageSrc(player.imageUrl, DEFAULT_WRESTLER_IMAGE)}
            onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
            alt={player.name}
            className="profile-image"
          />
        </div>
        <div className="profile-header-info">
          <h1 className="profile-name">{player.name}</h1>
          {player.currentWrestler && (
            <p className="profile-wrestler-name">
              Playing as {player.currentWrestler}
            </p>
          )}
          {player.bio && !editing && (
            <p className="profile-bio">{player.bio}</p>
          )}
        </div>
        {!editing && (
          <button
            className="edit-icon-btn"
            onClick={handleEdit}
            aria-label="Edit profile"
            title="Edit profile"
          >
&#9998;
          </button>
        )}
      </div>
      {/* Edit Form (edit mode only) */}
      {editing && (
        <div className="profile-edit-section">
          <h3>Edit Profile</h3>
          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-group">
              <label htmlFor="profile-name">Player Name</label>
              <input
                type="text"
                id="profile-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Your player name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="profile-wrestler">Current Wrestler</label>
              <input
                type="text"
                id="profile-wrestler"
                value={formData.currentWrestler}
                onChange={(e) => setFormData({ ...formData, currentWrestler: e.target.value })}
                placeholder="The wrestler you play as"
              />
            </div>

            <div className="form-group">
              <label htmlFor="profile-bio">Bio</label>
              <textarea
                id="profile-bio"
                className="bio-textarea"
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Tell us about yourself..."
                maxLength={255}
                rows={4}
              />
              <div className="bio-counter">
                {formData.bio.length} / 255
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="profile-image">Wrestler Image</label>
              <div className="profile-image-upload">
                {imagePreview ? (
                  <div className="profile-image-preview">
                    <img src={imagePreview} alt="Preview" />
                    <button type="button" onClick={clearImage} className="remove-image-btn">
                      Remove Image
                    </button>
                  </div>
                ) : (
                  <div className="profile-image-upload-box">
                    <input
                      type="file"
                      id="profile-image"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleFileSelect}
                      className="file-input"
                    />
                    <label htmlFor="profile-image" className="file-input-label">
                      Click to upload image
                    </label>
                    <p className="upload-hint">{FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS} (max {FILE_UPLOAD_LIMITS.MAX_SIZE_MB}MB)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="save-btn"
                disabled={submitting || uploading}
              >
                {submitting ? 'Saving...' : uploading ? 'Uploading...' : 'Save Profile'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="cancel-btn"
                disabled={submitting || uploading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* All-Time Stats */}
      <div className="stats-section">
        <h3 className="stats-section-title">All-Time Record</h3>
        <div className="profile-stats">
          <div className="stat-card">
            <span className="stat-label">Record</span>
            <span className="stat-value record">
              {player.wins}-{player.losses}-{player.draws}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Win %</span>
            <span className={`stat-value percentage ${getWinPercentageClass(player.wins, player.losses, player.draws)}`}>
              {getWinPercentage(player.wins, player.losses, player.draws)}%
            </span>
          </div>
        </div>
      </div>

      {/* Season Records */}
      {player.seasonRecords && player.seasonRecords.length > 0 && (
        <div className="stats-section">
          <h3 className="stats-section-title">Season Records</h3>
          <div className="season-records">
            {player.seasonRecords.map((season) => (
              <div key={season.seasonId} className="season-record-card">
                <div className="season-record-header">
                  <span className="season-record-name">{season.seasonName}</span>
                  {season.seasonStatus === 'active' && (
                    <span className="season-active-badge">Active</span>
                  )}
                </div>
                <div className="season-record-stats">
                  <span className="season-record-value">
                    {season.wins}-{season.losses}-{season.draws}
                  </span>
                  <span className={`season-record-pct ${getWinPercentageClass(season.wins, season.losses, season.draws)}`}>
                    {getWinPercentage(season.wins, season.losses, season.draws)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {features.statistics && player.playerId && (
        <EmbeddedPlayerStats playerId={player.playerId} />
      )}

      
    </div>
  );
}
