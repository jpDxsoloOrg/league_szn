import { useState, useEffect, FormEvent, ChangeEvent, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  playersApi,
  imagesApi,
  divisionsApi,
  wrestlersApi,
  seasonsApi,
  adminApi,
} from '../../services/api';
import { sanitizeName } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import { FILE_UPLOAD_LIMITS, VALIDATION } from '../../constants';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import type {
  Player,
  Division,
  Wrestler,
} from '../../types';
import {
  buildWrestlerOptionGroups,
  type WrestlerSlotOptions,
} from '../../utils/wrestlerOptions';
import './ManagePlayers.css';

export default function ManagePlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Active-status override state. `activeSeasonId` is null when the league is
  // between seasons — overrides are season-scoped, so the control is disabled.
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  // Form state — FK-backed. The legacy `currentWrestler` / `alternateWrestler`
  // string inputs are gone; the backend denormalizes the name from the
  // selected wrestler's roster row.
  const [formData, setFormData] = useState({
    name: '',
    currentWrestlerId: '',
    alternateWrestlerId: '',
    imageUrl: '',
    divisionId: '',
    psnId: '',
    alignment: '' as '' | 'face' | 'heel' | 'neutral',
    canUploadVideos: false,
  });

  // Image upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Division filter for the players table. `null` means "not yet initialized";
  // a one-shot effect picks Heavyweight (or "all" if Heavyweight is missing)
  // once divisions load. Special values: 'all' = no filter, 'none' = players
  // with no division assigned.
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (divisionFilter !== null || divisions.length === 0) return;
    const heavyweight = divisions.find(
      (d) => d.name.toLowerCase() === 'heavyweight',
    );
    setDivisionFilter(heavyweight ? heavyweight.divisionId : 'all');
  }, [divisions, divisionFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [playersData, divisionsData, wrestlersData, seasonsData] = await Promise.all([
        playersApi.getAll(),
        divisionsApi.getAll(),
        wrestlersApi.getAll(),
        seasonsApi.getAll(),
      ]);
      setPlayers(playersData);
      setDivisions(divisionsData);
      setWrestlers(wrestlersData);
      setActiveSeasonId(seasonsData.find((s) => s.status === 'active')?.seasonId ?? null);
    } catch (_err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Three-state active override: 'auto' derives from whether the wrestler has
   * completed a match this season, 'active'/'inactive' force it. The override
   * expires at season rollover, so it is only meaningful while a season runs.
   */
  const getActiveMode = (player: Player): 'auto' | 'active' | 'inactive' => {
    const override = player.activeOverride;
    if (!override || !activeSeasonId || override.seasonId !== activeSeasonId) return 'auto';
    return override.value ? 'active' : 'inactive';
  };

  const handleActiveModeChange = async (player: Player, mode: string) => {
    const value = mode === 'auto' ? null : mode === 'active';
    try {
      setSavingStatus(player.playerId);
      setError(null);
      const result = await playersApi.setActiveStatus(player.playerId, value);
      setPlayers((prev) =>
        prev.map((p) =>
          p.playerId === player.playerId
            ? { ...p, isActive: result.isActive, activeOverride: result.activeOverride }
            : p,
        ),
      );
      setSuccess(`${player.name} is now ${result.isActive ? 'active' : 'inactive'}`);
    } catch (err) {
      logger.error('Failed to update active status');
      setError(err instanceof Error ? err.message : 'Failed to update active status');
    } finally {
      setSavingStatus(null);
    }
  };

  const handleRecomputeActiveStatus = async () => {
    try {
      setRecomputing(true);
      setError(null);
      const result = await adminApi.recomputeActiveStatus();
      setSuccess(
        `Active status recomputed: ${result.marked} marked active, ${result.cleared} cleared.`,
      );
      await loadData();
    } catch (err) {
      logger.error('Failed to recompute active status');
      setError(err instanceof Error ? err.message : 'Failed to recompute active status');
    } finally {
      setRecomputing(false);
    }
  };

  const getDivisionName = (divisionId?: string) => {
    if (!divisionId) return 'None';
    const division = divisions.find(d => d.divisionId === divisionId);
    return division?.name || 'Unknown';
  };

  const currentWrestlerOptions = useMemo(
    () =>
      buildWrestlerOptionGroups(
        wrestlers,
        formData.currentWrestlerId || undefined,
        formData.alternateWrestlerId || undefined,
      ),
    [wrestlers, formData.currentWrestlerId, formData.alternateWrestlerId],
  );

  const alternateWrestlerOptions = useMemo(
    () =>
      buildWrestlerOptionGroups(
        wrestlers,
        formData.alternateWrestlerId || undefined,
        formData.currentWrestlerId || undefined,
      ),
    [wrestlers, formData.currentWrestlerId, formData.alternateWrestlerId],
  );

  const filteredPlayers = useMemo(() => {
    if (divisionFilter === null || divisionFilter === 'all') return players;
    if (divisionFilter === 'none') return players.filter((p) => !p.divisionId);
    return players.filter((p) => p.divisionId === divisionFilter);
  }, [players, divisionFilter]);

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

  const resetFormData = () => ({
    name: '',
    currentWrestlerId: '',
    alternateWrestlerId: '',
    imageUrl: '',
    divisionId: '',
    psnId: '',
    alignment: '' as '' | 'face' | 'heel' | 'neutral',
    canUploadVideos: false,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || uploading) return; // Prevent double submission

    setError(null);
    setSubmitting(true);

    try {
      // Upload image first if one is selected
      const imageUrl = await uploadImage();

      const sanitizedName = sanitizeName(formData.name, VALIDATION.MAX_NAME_LENGTH);

      if (!sanitizedName) {
        setError('Player name cannot be empty');
        return;
      }
      if (editingPlayer) {
        await playersApi.update(editingPlayer.playerId, {
          name: sanitizedName,
          // Empty string clears the FK server-side (mirrors how divisionId
          // and alignment are cleared on this same endpoint) — clearing the
          // primary slot drops the player back to "Needs Wrestler".
          currentWrestlerId: formData.currentWrestlerId,
          alternateWrestlerId: formData.alternateWrestlerId || '',
          imageUrl: imageUrl || undefined,
          divisionId: formData.divisionId || '',
          psnId: formData.psnId.trim() || undefined,
          alignment: formData.alignment || '',
          canUploadVideos: formData.canUploadVideos,
        });
      } else {
        await playersApi.create({
          name: sanitizedName,
          // Kept to satisfy the legacy Player type; the backend overwrites it
          // from the selected wrestler's name, or falls back to the
          // "Needs Wrestler" placeholder when no wrestler is picked.
          currentWrestler: '',
          ...(formData.currentWrestlerId
            ? { currentWrestlerId: formData.currentWrestlerId }
            : {}),
          ...(formData.alternateWrestlerId
            ? { alternateWrestlerId: formData.alternateWrestlerId }
            : {}),
          imageUrl: imageUrl || undefined,
          divisionId: formData.divisionId || undefined,
          psnId: formData.psnId.trim() || undefined,
          alignment: formData.alignment || undefined,
          wins: 0,
          losses: 0,
          draws: 0,
        });
      }

      setFormData(resetFormData());
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
      currentWrestlerId: player.currentWrestlerId || '',
      alternateWrestlerId: player.alternateWrestlerId || '',
      imageUrl: player.imageUrl || '',
      divisionId: player.divisionId || '',
      psnId: player.psnId || '',
      alignment: player.alignment || '',
      canUploadVideos: player.canUploadVideos ?? false,
    });
    setImagePreview(player.imageUrl || null);
    setSelectedFile(null);
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setFormData(resetFormData());
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

  const renderWrestlerOptions = (groups: WrestlerSlotOptions) =>
    groups.map((group) => (
      <optgroup key={group.promotion} label={group.promotion}>
        {group.wrestlers.map((w) => (
          <option key={w.wrestlerId} value={w.wrestlerId}>
            {w.name} — OVR {w.overallCap}
          </option>
        ))}
      </optgroup>
    ));

  const rosterEmpty = wrestlers.length === 0;

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
        <div className="player-form-container am-sheet">
          <h3>{editingPlayer ? 'Edit Player' : 'Add New Player'}</h3>
          {rosterEmpty && (
            <div className="info-message">
              No wrestlers in the roster yet. You can still create players — they stay on
              &ldquo;Needs Wrestler&rdquo; until you add wrestlers via{' '}
              <Link to="/admin/wrestlers">Manage Wrestlers</Link> and assign one.
            </div>
          )}
          <form onSubmit={handleSubmit} className="player-form am-form">
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
              <select
                id="wrestler"
                value={formData.currentWrestlerId}
                onChange={(e) =>
                  setFormData({ ...formData, currentWrestlerId: e.target.value })
                }
                disabled={rosterEmpty}
              >
                <option value="">Needs Wrestler — assign later</option>
                {renderWrestlerOptions(currentWrestlerOptions)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="alternateWrestler">Alternate Wrestler</label>
              <select
                id="alternateWrestler"
                value={formData.alternateWrestlerId}
                onChange={(e) =>
                  setFormData({ ...formData, alternateWrestlerId: e.target.value })
                }
                disabled={rosterEmpty}
              >
                <option value="">None</option>
                {renderWrestlerOptions(alternateWrestlerOptions)}
              </select>
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
              <label htmlFor="alignment">Alignment</label>
              <select
                id="alignment"
                value={formData.alignment}
                onChange={(e) => setFormData({ ...formData, alignment: e.target.value as '' | 'face' | 'heel' | 'neutral' })}
              >
                <option value="">Not Set</option>
                <option value="face">😇 Face</option>
                <option value="neutral">⚖️ Neutral</option>
                <option value="heel">😈 Heel</option>
              </select>
            </div>

            <div className="form-group form-checkbox">
              <label htmlFor="canUploadVideos" className="am-toggle-row">
                <input
                  type="checkbox"
                  className="am-toggle"
                  id="canUploadVideos"
                  checked={formData.canUploadVideos}
                  onChange={(e) => setFormData({ ...formData, canUploadVideos: e.target.checked })}
                />
                {' '}Allow video uploads (wrestler can submit drafts via /my-videos)
              </label>
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

            <div className="form-actions am-actionbar">
              <button type="submit" disabled={submitting || uploading || rosterEmpty}>
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
        <div className="players-list-header">
          <h3>
            All Players ({filteredPlayers.length}
            {filteredPlayers.length !== players.length ? ` of ${players.length}` : ''})
          </h3>
          <div className="players-filter am-filter-row">
            <button
              type="button"
              className="recompute-status-btn"
              onClick={handleRecomputeActiveStatus}
              disabled={recomputing || !activeSeasonId}
              title={
                activeSeasonId
                  ? 'Rebuild active status from this season\u2019s completed matches'
                  : 'No active season'
              }
            >
              {recomputing ? 'Recomputing...' : 'Recompute active status'}
            </button>
            <label htmlFor="divisionFilter">Division:</label>
            <select
              id="divisionFilter"
              value={divisionFilter ?? 'all'}
              onChange={(e) => setDivisionFilter(e.target.value)}
            >
              <option value="all">All</option>
              {divisions.map((division) => (
                <option key={division.divisionId} value={division.divisionId}>
                  {division.name}
                </option>
              ))}
              <option value="none">No Division</option>
            </select>
          </div>
        </div>
        {players.length === 0 ? (
          <p>No players yet. Add your first player!</p>
        ) : filteredPlayers.length === 0 ? (
          <p>No players match the selected division.</p>
        ) : (
          <div className="players-table-wrapper">
          <table className="players-table am-card-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Player Name</th>
                <th>Wrestler</th>
                <th>Alt. Wrestler</th>
                <th>PSN</th>
                <th>Division</th>
                <th>Alignment</th>
                <th>Record</th>
                <th>Status</th>
                <th>Linked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((player) => (
                <tr key={player.playerId} className="am-list-row">
                  <td className="am-row-media">
                    <img
                      src={resolveImageSrc(player.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                      onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                      alt={player.currentWrestler}
                      className="player-thumbnail"
                    />
                  </td>
                  <td className="am-row-title">{player.name}</td>
                  <td className="am-row-sub">{player.currentWrestler}</td>
                  <td className="am-row-extra">{player.alternateWrestler || '-'}</td>
                  <td className="am-row-extra">{player.psnId || '-'}</td>
                  <td className="division-cell am-row-badge">{getDivisionName(player.divisionId)}</td>
                  <td className="alignment-cell am-row-extra">
                    {player.alignment === 'face' && <span className="alignment-badge face">😇 Face</span>}
                    {player.alignment === 'heel' && <span className="alignment-badge heel">😈 Heel</span>}
                    {player.alignment === 'neutral' && <span className="alignment-badge neutral">⚖️ Neutral</span>}
                    {!player.alignment && <span className="alignment-badge unset">-</span>}
                  </td>
                  <td className="am-row-extra">
                    <span className="record">
                      {player.wins}W - {player.losses}L - {player.draws}D
                    </span>
                  </td>
                  <td className="active-status-cell am-row-extra">
                    <span
                      className={`status-badge ${player.isActive ? 'active' : 'inactive'}`}
                    >
                      {player.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <select
                      className="active-mode-select"
                      aria-label={`Active status for ${player.name}`}
                      value={getActiveMode(player)}
                      disabled={!activeSeasonId || savingStatus === player.playerId}
                      title={activeSeasonId ? undefined : 'No active season'}
                      onChange={(e) => handleActiveModeChange(player, e.target.value)}
                    >
                      <option value="auto">Auto</option>
                      <option value="active">Force active</option>
                      <option value="inactive">Force inactive</option>
                    </select>
                  </td>
                  <td className="am-row-extra">
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
                  <td className="am-row-actions">
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
