import { useState, useEffect, FormEvent, ChangeEvent, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  playersApi,
  imagesApi,
  divisionsApi,
  wrestlersApi,
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
  WrestlerPromotion,
} from '../../types';
import './ManagePlayers.css';

type WrestlerSlotOptions = ReadonlyArray<{
  promotion: WrestlerPromotion;
  wrestlers: Wrestler[];
}>;

/**
 * Build `<optgroup>`s of wrestlers for a dropdown. The selected wrestler (if
 * any) is always included so the edit form renders its current pick even
 * when that wrestler is `isInUse=true`. Other in-use wrestlers are hidden to
 * prevent double-assignment.
 */
function buildOptionGroups(
  allWrestlers: Wrestler[],
  selectedWrestlerId: string | undefined,
  excludeWrestlerId: string | undefined,
): WrestlerSlotOptions {
  const visible = allWrestlers.filter((w) => {
    // Ghost roster rows (e.g. from a release against a deleted wrestlerId)
    // lack name/promotion — drop them rather than crash the sorts below.
    if (typeof w.name !== 'string' || typeof w.promotion !== 'string') return false;
    if (w.wrestlerId === excludeWrestlerId) return false; // never show the other-slot pick
    if (!w.isInUse) return true;
    return w.wrestlerId === selectedWrestlerId;
  });

  const byPromotion = new Map<WrestlerPromotion, Wrestler[]>();
  for (const w of visible) {
    const bucket = byPromotion.get(w.promotion) ?? [];
    bucket.push(w);
    byPromotion.set(w.promotion, bucket);
  }

  return Array.from(byPromotion.entries())
    .map(([promotion, wrestlers]) => ({
      promotion,
      wrestlers: wrestlers.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.promotion.localeCompare(b.promotion));
}

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
      const [playersData, divisionsData, wrestlersData] = await Promise.all([
        playersApi.getAll(),
        divisionsApi.getAll(),
        wrestlersApi.getAll(),
      ]);
      setPlayers(playersData);
      setDivisions(divisionsData);
      setWrestlers(wrestlersData);
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

  const currentWrestlerOptions = useMemo(
    () =>
      buildOptionGroups(
        wrestlers,
        formData.currentWrestlerId || undefined,
        formData.alternateWrestlerId || undefined,
      ),
    [wrestlers, formData.currentWrestlerId, formData.alternateWrestlerId],
  );

  const alternateWrestlerOptions = useMemo(
    () =>
      buildOptionGroups(
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
      if (!formData.currentWrestlerId) {
        setError('Please pick a wrestler from the roster');
        return;
      }

      if (editingPlayer) {
        await playersApi.update(editingPlayer.playerId, {
          name: sanitizedName,
          currentWrestlerId: formData.currentWrestlerId,
          // Empty string clears the FK server-side (mirrors how divisionId
          // and alignment are cleared on this same endpoint).
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
          // Kept to satisfy the legacy Player type; backend overwrites this
          // from the selected wrestler's name.
          currentWrestler: '',
          currentWrestlerId: formData.currentWrestlerId,
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
            <div className="error-message">
              No wrestlers in the roster yet. Add wrestlers via{' '}
              <Link to="/admin/wrestlers">Manage Wrestlers</Link> before creating players.
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
                required
                disabled={rosterEmpty}
              >
                <option value="">Pick from the roster…</option>
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
