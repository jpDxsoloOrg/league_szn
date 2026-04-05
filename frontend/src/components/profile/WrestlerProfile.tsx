import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { profileApi, imagesApi, overallsApi, transfersApi, divisionsApi } from '../../services/api';
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
import type { Player, WrestlerOverall, TransferRequestWithDetails, Division } from '../../types';
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
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { features } = useSiteConfig();

  // Overalls state
  const [overall, setOverall] = useState<WrestlerOverall | null>(null);
  const [overallForm, setOverallForm] = useState({ mainOverall: '', alternateOverall: '' });

  // Transfer state
  const [transferRequests, setTransferRequests] = useState<TransferRequestWithDetails[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [transferForm, setTransferForm] = useState({ toDivisionId: '', reason: '' });
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    currentWrestler: '',
    alternateWrestler: '',
    imageUrl: '',
    psnId: '',
    alignment: '' as '' | 'face' | 'heel' | 'neutral',
  });

  // Image upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    loadOverall();
    loadTransfers();
    loadDivisions();
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
        alternateWrestler: profile.alternateWrestler || '',
        imageUrl: profile.imageUrl || '',
        psnId: profile.psnId || '',
        alignment: profile.alignment || '',
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

  const loadOverall = async () => {
    try {
      const data = await overallsApi.getMyOverall();
      setOverall(data);
      setOverallForm({
        mainOverall: String(data.mainOverall),
        alternateOverall: data.alternateOverall !== undefined ? String(data.alternateOverall) : '',
      });
    } catch {
      // 404 means no overall submitted yet — that's fine
    }
  };

  const loadTransfers = async () => {
    try {
      const data = await transfersApi.getMyRequests();
      setTransferRequests(data);
    } catch {
      // Not a critical failure — silently ignore
    }
  };

  const loadDivisions = async () => {
    try {
      const data = await divisionsApi.getAll();
      setDivisions(data);
    } catch {
      // Silently ignore
    }
  };

  const handleTransferSubmit = async () => {
    if (!transferForm.toDivisionId || !transferForm.reason.trim()) return;
    try {
      setTransferSubmitting(true);
      setTransferError(null);
      setTransferSuccess(null);
      await transfersApi.createRequest({
        toDivisionId: transferForm.toDivisionId,
        reason: transferForm.reason.trim(),
      });
      setTransferForm({ toDivisionId: '', reason: '' });
      setTransferSuccess('Transfer request submitted successfully.');
      await loadTransfers();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Failed to submit transfer request');
    } finally {
      setTransferSubmitting(false);
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
        alternateWrestler: player.alternateWrestler || '',
        imageUrl: player.imageUrl || '',
        psnId: player.psnId || '',
        alignment: player.alignment || '',
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
        alternateWrestler: player.alternateWrestler || '',
        imageUrl: player.imageUrl || '',
        psnId: player.psnId || '',
        alignment: player.alignment || '',
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

      const updates: { name?: string; currentWrestler?: string; alternateWrestler?: string; imageUrl?: string; psnId?: string; alignment?: 'face' | 'heel' | 'neutral' | '' } = {
        name: sanitizedName,
      };

      if (sanitizedWrestler) {
        updates.currentWrestler = sanitizedWrestler;
      }

      // Send empty string to clear, or trimmed value to set
      updates.alternateWrestler = formData.alternateWrestler.trim();

      if (imageUrl) {
        updates.imageUrl = imageUrl;
      }

      if (formData.psnId.trim()) {
        updates.psnId = formData.psnId.trim();
      }

      updates.alignment = formData.alignment || '';

      const updated = await profileApi.updateMyProfile(updates);
      setPlayer(updated);

      // Save overalls if main overall is provided
      if (overallForm.mainOverall) {
        const main = parseInt(overallForm.mainOverall, 10);
        const alt = overallForm.alternateOverall ? parseInt(overallForm.alternateOverall, 10) : undefined;
        if (!isNaN(main) && main >= 60 && main <= 99) {
          if (alt === undefined || (!isNaN(alt) && alt >= 60 && alt <= 99)) {
            const saved = await overallsApi.submitOverall({ mainOverall: main, alternateOverall: alt });
            setOverall(saved);
          }
        }
      }

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
          {player.alternateWrestler && (
            <p className="profile-alternate-wrestler">
              Alternate: {player.alternateWrestler}
            </p>
          )}
          {player.psnId && (
            <p className="profile-psn-id">
              PSN: {player.psnId}
            </p>
          )}
          {player.alignment && (
            <span className={`alignment-badge profile-alignment alignment-${player.alignment}`}>
              {player.alignment === 'face' && '😇 Face'}
              {player.alignment === 'neutral' && '⚖️ Neutral'}
              {player.alignment === 'heel' && '😈 Heel'}
            </span>
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
              <label htmlFor="profile-alternate-wrestler">Alternate Wrestler</label>
              <input
                type="text"
                id="profile-alternate-wrestler"
                value={formData.alternateWrestler}
                onChange={(e) => setFormData({ ...formData, alternateWrestler: e.target.value })}
                placeholder="Your backup wrestler"
              />
            </div>

            <div className="form-group">
              <label htmlFor="profile-psn">PSN ID</label>
              <input
                type="text"
                id="profile-psn"
                value={formData.psnId}
                onChange={(e) => setFormData({ ...formData, psnId: e.target.value })}
                placeholder="Your PlayStation Network ID"
              />
            </div>

            <div className="form-group">
              <label>Alignment</label>
              <div className="alignment-radio-group">
                {([
                  { value: '', label: 'Not Set' },
                  { value: 'face', label: '😇 Face' },
                  { value: 'neutral', label: '⚖️ Neutral' },
                  { value: 'heel', label: '😈 Heel' },
                ] as const).map(({ value, label }) => (
                  <label key={value} className={`alignment-radio-label alignment-radio-${value || 'unset'}`}>
                    <input
                      type="radio"
                      name="alignment"
                      value={value}
                      checked={formData.alignment === value}
                      onChange={() => setFormData({ ...formData, alignment: value })}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="alignment-hint">Helps GMs with booking and other players with promos. Doesn't affect matchups.</p>
            </div>

            <div className="form-group">
              <label htmlFor="main-overall">{t('overalls.profile.mainOverall')}</label>
              <input
                type="number"
                id="main-overall"
                min={60}
                max={99}
                value={overallForm.mainOverall}
                onChange={e => setOverallForm({ ...overallForm, mainOverall: e.target.value })}
                placeholder="60–99"
              />
            </div>

            <div className="form-group">
              <label htmlFor="alt-overall">{t('overalls.profile.altOverall')}</label>
              <input
                type="number"
                id="alt-overall"
                min={60}
                max={99}
                value={overallForm.alternateOverall}
                onChange={e => setOverallForm({ ...overallForm, alternateOverall: e.target.value })}
                placeholder="60–99"
              />
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

            {player.divisionId && (
              <div className="form-group transfer-form-group">
                <label className="form-section-label">Division Transfer</label>
                {(() => {
                  const pending = transferRequests.find((r) => r.status === 'pending');
                  if (pending) {
                    return (
                      <div className="transfer-status-card">
                        <p className="transfer-status-msg">
                          Request pending — moving to <strong>{pending.toDivisionName}</strong>
                        </p>
                        <p className="transfer-status-sub">Submitted {new Date(pending.createdAt).toLocaleDateString()}</p>
                      </div>
                    );
                  }
                  const availableDivisions = divisions.filter((d) => d.divisionId !== player.divisionId);
                  return (
                    <>
                      {transferError && <div className="error-message">{transferError}</div>}
                      {transferSuccess && <div className="success-message">{transferSuccess}</div>}
                      <select
                        id="transfer-division"
                        value={transferForm.toDivisionId}
                        onChange={(e) => setTransferForm({ ...transferForm, toDivisionId: e.target.value })}
                      >
                        <option value="">Request a division move...</option>
                        {availableDivisions.map((d) => (
                          <option key={d.divisionId} value={d.divisionId}>{d.name}</option>
                        ))}
                      </select>
                      {transferForm.toDivisionId && (
                        <>
                          <textarea
                            id="transfer-reason"
                            value={transferForm.reason}
                            onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                            placeholder="Why do you want to transfer divisions?"
                            rows={3}
                            style={{ marginTop: '0.5rem' }}
                          />
                          <button
                            type="button"
                            className="save-btn"
                            style={{ marginTop: '0.5rem' }}
                            onClick={handleTransferSubmit}
                            disabled={transferSubmitting || !transferForm.reason.trim()}
                          >
                            {transferSubmitting ? 'Submitting...' : 'Submit Transfer Request'}
                          </button>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

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

      {/* Wrestler Overalls */}
      {overall && (
        <div className="stats-section">
          <h3 className="stats-section-title">{t('overalls.profile.title')}</h3>
          <div className="profile-stats">
            <div className="stat-card">
              <span className="stat-label">{t('overalls.admin.mainOverall')}</span>
              <span className="stat-value">{overall.mainOverall}</span>
            </div>
            {overall.alternateOverall !== undefined && (
              <div className="stat-card">
                <span className="stat-label">{t('overalls.admin.altOverall')}</span>
                <span className="stat-value">{overall.alternateOverall}</span>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Transfer request history (view mode) */}
      {transferRequests.length > 0 && (
        <div className="stats-section">
          <h3 className="stats-section-title">Division Transfer History</h3>
          <div className="transfer-history-list">
            {transferRequests.map((req) => (
              <div key={req.requestId} className={`transfer-history-item transfer-history-${req.status}`}>
                <div className="transfer-history-row">
                  <span className="transfer-history-divisions">
                    {req.fromDivisionName} → {req.toDivisionName}
                  </span>
                  <span className={`transfer-badge ${req.status}`}>{req.status}</span>
                  <span className="transfer-history-date">{new Date(req.updatedAt).toLocaleDateString()}</span>
                </div>
                {req.status === 'rejected' && req.reviewNote && (
                  <p className="transfer-history-note">Reason: {req.reviewNote}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
