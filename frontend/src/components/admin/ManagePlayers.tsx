import { useState, useEffect, FormEvent, ChangeEvent, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  playersApi,
  imagesApi,
  divisionsApi,
  wrestlersApi,
  isApiError,
} from '../../services/api';
import { sanitizeName } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import { FILE_UPLOAD_LIMITS, VALIDATION } from '../../constants';
import type {
  Player,
  Division,
  Wrestler,
} from '../../types';
import {
  buildWrestlerOptionGroups,
  type WrestlerSlotOptions,
} from '../../utils/wrestlerOptions';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import AdminNotice from './AdminNotice';
import ConfirmModal from './ConfirmModal';
import HiddenBadge from './HiddenBadge';
import SourceLoadNotice from './SourceLoadNotice';
import { settleSources } from './loadSources';
import './adminRoster.css';
import './ManagePlayers.css';

const FORM_ID = 'player-form';

/** Select value for a wrestler held by name only, with no roster link. */
const NAME_ONLY_SLOT = '__name-only__';

const PLAYER_SOURCES = {
  players: () => playersApi.getAllIncludingHidden(),
  divisions: () => divisionsApi.getAll(),
  wrestlers: () => wrestlersApi.getAll(),
};

type PlayerSource = keyof typeof PLAYER_SOURCES;

/** What a wrestler select opens on, so an untouched slot can be told from a cleared one. */
function initialSlotValue(wrestlerId: string | null | undefined, wrestlerName: string | null | undefined): string {
  if (wrestlerId) return wrestlerId;
  return isNeedsWrestler(wrestlerName) ? '' : NAME_ONLY_SLOT;
}

export default function ManagePlayers() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedSources, setFailedSources] = useState<PlayerSource[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Player | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  // Division filter for the players table. Defaults to everyone, because hidden
  // players usually have no division yet and must not start out of view.
  // Special values: 'all' = no filter, 'none' = players with no division
  // assigned, 'hidden' = players with no wrestler.
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { values, failed } = await settleSources(PLAYER_SOURCES);
    if (values.players) setPlayers(values.players);
    if (values.divisions) setDivisions(values.divisions);
    if (values.wrestlers) setWrestlers(values.wrestlers);
    setFailedSources(failed);
    setLoading(false);
  };

  const getDivisionName = (divisionId?: string) => {
    if (!divisionId) return t('common.none', 'None');
    const division = divisions.find(d => d.divisionId === divisionId);
    return division?.name || t('common.unknown', 'Unknown');
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

  const initialCurrentSlot = editingPlayer
    ? initialSlotValue(editingPlayer.currentWrestlerId, editingPlayer.currentWrestler)
    : '';
  const initialAlternateSlot = editingPlayer
    ? initialSlotValue(editingPlayer.alternateWrestlerId, editingPlayer.alternateWrestler)
    : '';

  const hiddenCount = useMemo(
    () => players.filter((player) => isNeedsWrestler(player.currentWrestler)).length,
    [players],
  );

  const filteredPlayers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return players.filter((player) => {
      if (divisionFilter === 'hidden' && !isNeedsWrestler(player.currentWrestler)) return false;
      if (divisionFilter === 'none' && player.divisionId) return false;
      if (!['all', 'none', 'hidden'].includes(divisionFilter) && player.divisionId !== divisionFilter) return false;
      if (!term) return true;
      return [player.name, player.currentWrestler, player.alternateWrestler, player.psnId]
        .some((value) => value?.toLowerCase().includes(term));
    });
  }, [players, divisionFilter, search]);

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
        if (isApiError(err, 401)) {
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
        setError(t('adminRoster.players.nameRequired', 'Player name cannot be empty'));
        return;
      }
      if (editingPlayer) {
        await playersApi.update(editingPlayer.playerId, {
          name: sanitizedName,
          // A slot only goes out when the admin changed it, because clearing
          // the primary slot hides the player. The API ignores an empty id on
          // a slot held by name alone, so a clear has to be stated outright.
          ...(formData.currentWrestlerId !== initialCurrentSlot
            ? formData.currentWrestlerId
              ? { currentWrestlerId: formData.currentWrestlerId }
              : { clearCurrentWrestler: true }
            : {}),
          ...(formData.alternateWrestlerId !== initialAlternateSlot
            ? formData.alternateWrestlerId
              ? { alternateWrestlerId: formData.alternateWrestlerId }
              : { clearAlternateWrestler: true }
            : {}),
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
      setSuccess(editingPlayer
        ? t('adminRoster.players.updated', 'Player updated successfully!')
        : t('adminRoster.players.created', 'Player created successfully!'));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.players.saveError', 'Failed to save player'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (player: Player) => {
    setEditingPlayer(player);
    setFormData({
      name: player.name,
      currentWrestlerId: initialSlotValue(player.currentWrestlerId, player.currentWrestler),
      alternateWrestlerId: initialSlotValue(player.alternateWrestlerId, player.alternateWrestler),
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
    setError(null);
    setFormData(resetFormData());
    setSelectedFile(null);
    setImagePreview(null);
    setShowAddForm(false);
    setEditingPlayer(null);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await playersApi.delete(pendingDelete.playerId);
      setSuccess(t('adminRoster.players.deleted', 'Player deleted successfully!'));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.players.deleteError', 'Failed to delete player'));
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

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

  /**
   * Keeps a wrestler the roster can't supply selectable: a name with no roster
   * link, or a link whose roster row is gone. Without this option the select
   * would read as if no wrestler were assigned.
   */
  const renderKeptWrestlerOption = (
    groups: WrestlerSlotOptions,
    initialValue: string,
    wrestlerName: string | null | undefined,
  ) => {
    const onRoster = groups.some((group) => group.wrestlers.some((w) => w.wrestlerId === initialValue));
    if (!initialValue || onRoster || isNeedsWrestler(wrestlerName)) return null;
    return (
      <option value={initialValue}>
        {t('adminRoster.players.keptWrestler', { defaultValue: '{{name}} (not linked to the roster)', name: wrestlerName })}
      </option>
    );
  };

  const rosterEmpty = wrestlers.length === 0;
  const rosterLoadFailed = failedSources.includes('wrestlers');
  const clearingPrimarySlot = initialCurrentSlot !== '' && formData.currentWrestlerId === '';

  const alignmentLabels: Record<'face' | 'heel' | 'neutral', string> = {
    face: t('adminRoster.players.alignmentFace', 'Face'),
    heel: t('adminRoster.players.alignmentHeel', 'Heel'),
    neutral: t('adminRoster.players.alignmentNeutral', 'Neutral'),
  };

  const submitLabel = () => {
    if (submitting) return t('common.saving', 'Saving...');
    if (uploading) return t('adminRoster.players.uploading', 'Uploading...');
    return editingPlayer
      ? t('adminRoster.players.update', 'Update Player')
      : t('adminRoster.players.add', 'Add Player');
  };

  const columns: DataTableColumn<Player>[] = [
    {
      key: 'player',
      header: t('adminRoster.players.player', 'Player'),
      sortValue: (player) => player.name,
      render: (player) => (
        <span className="ar-identity">
          <Avatar src={player.imageUrl} name={player.name} size="sm" />
          <span className="ar-stack">
            <span className="ar-strong">{player.name}</span>
            {player.psnId && <span className="ar-sub">{player.psnId}</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'wrestler',
      header: t('adminRoster.players.wrestler', 'Wrestler'),
      sortValue: (player) => (isNeedsWrestler(player.currentWrestler) ? '' : player.currentWrestler),
      render: (player) => (
        <span className="ar-stack">
          {isNeedsWrestler(player.currentWrestler) ? <HiddenBadge /> : <span>{player.currentWrestler}</span>}
          {player.alternateWrestler && (
            <span className="ar-sub">
              {t('adminRoster.players.alternateShort', 'Alt')}: {player.alternateWrestler}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'division',
      header: t('adminRoster.players.division', 'Division'),
      sortValue: (player) => getDivisionName(player.divisionId),
      render: (player) => <span className="division-cell">{getDivisionName(player.divisionId)}</span>,
    },
    {
      key: 'record',
      header: t('adminRoster.players.record', 'Record'),
      sortValue: (player) => player.wins,
      render: (player) => (
        <span className="ar-numeric">{player.wins}W - {player.losses}L - {player.draws}D</span>
      ),
    },
    {
      key: 'status',
      header: t('adminRoster.players.status', 'Status'),
      render: (player) => (
        <span className="ar-badges">
          {player.alignment && <Badge tone="violet">{alignmentLabels[player.alignment]}</Badge>}
          {player.userId ? (
            <Badge
              tone="primary"
              className="linked-badge"
              title={t('adminRoster.players.linkedHint', 'This player is linked to a user account')}
            >
              {t('adminRoster.players.linked', 'Linked')}
            </Badge>
          ) : (
            <Badge title={t('adminRoster.players.manualHint', 'This player was created manually and is not linked to a user account')}>
              {t('adminRoster.players.manual', 'Manual')}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions', 'Actions'),
      align: 'end',
      render: (player) => (
        <div className="ar-row-actions">
          <Button variant="secondary" size="sm" onClick={() => handleEdit(player)}>{t('common.edit', 'Edit')}</Button>
          <Button variant="ghost" size="sm" onClick={() => setPendingDelete(player)}>{t('common.delete', 'Delete')}</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="ar-page manage-players">
      <PageHeader
        title={t('adminRoster.players.title', 'Manage Players')}
        subtitle={t('adminRoster.players.subtitle', 'Edit players, assign divisions, and keep wrestlers current.')}
        actions={(
          <Button variant="ghost" to="/guide/wiki/admin-manage-players">{t('adminRoster.learnMore', 'Learn more')}</Button>
        )}
      />

      <SourceLoadNotice failed={failedSources} onRetry={loadData} retrying={loading} />
      {error && !showAddForm && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <div className="ar-toolbar">
        <h2 className="ar-section-title">
          {t('adminRoster.players.all', 'All Players')} ({filteredPlayers.length}
          {filteredPlayers.length !== players.length ? ` ${t('adminRoster.of', 'of')} ${players.length}` : ''})
        </h2>
        {hiddenCount > 0 && (
          <span className="ar-count">
            {t('adminRoster.players.hiddenCount', { defaultValue: '{{count}} hidden', count: hiddenCount })}
          </span>
        )}
      </div>

      <div className="ar-toolbar__filters">
        <input
          className="ar-input ar-input--search"
          type="search"
          aria-label={t('adminRoster.players.search', 'Search players')}
          placeholder={t('adminRoster.players.search', 'Search players')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          label={t('adminRoster.players.filterLabel', 'Filter players')}
          value={divisionFilter}
          onValueChange={setDivisionFilter}
          options={[
            { value: 'all', label: t('common.all', 'All') },
            ...divisions.map((division) => ({ value: division.divisionId, label: division.name })),
            { value: 'none', label: t('adminRoster.players.noDivision', 'No Division') },
            { value: 'hidden', label: t('adminRoster.players.hiddenFilter', 'Hidden (no wrestler)') },
          ]}
        />
      </div>

      <DataTable
        className="ar-table"
        caption={t('adminRoster.players.all', 'All Players')}
        density="dense"
        columns={columns}
        rows={filteredPlayers}
        rowKey={(player) => player.playerId}
        loading={loading}
        empty={failedSources.includes('players') ? undefined : (
          <EmptyState
            title={players.length === 0
              ? t('adminRoster.players.emptyTitle', 'No players yet')
              : t('adminRoster.players.noMatches', 'No players match these filters')}
          />
        )}
      />

      <Modal
        open={showAddForm}
        onClose={handleCancel}
        size="lg"
        title={editingPlayer
          ? t('adminRoster.players.editTitle', 'Edit Player')
          : t('adminRoster.players.addTitle', 'Add New Player')}
        footer={(
          <>
            <Button variant="ghost" onClick={handleCancel} disabled={submitting || uploading}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" form={FORM_ID} disabled={submitting || uploading || rosterEmpty}>
              {submitLabel()}
            </Button>
          </>
        )}
      >
        <form id={FORM_ID} onSubmit={handleSubmit} className="ar-form">
          {error && <AdminNotice tone="error">{error}</AdminNotice>}
          {rosterEmpty && !rosterLoadFailed && (
            <AdminNotice tone="info">
              {t('adminRoster.players.rosterEmpty', 'No wrestlers in the roster yet. Add them in')}{' '}
              <Link to="/admin/wrestlers">{t('adminRoster.wrestlers.title', 'Manage Wrestlers')}</Link>.
            </AdminNotice>
          )}

          <div className="ar-form__grid">
            <div className="ar-field">
              <label className="ar-field__label" htmlFor="name">{t('adminRoster.players.nameLabel', 'Player Name')}</label>
              <input
                className="ar-input"
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="John Doe"
              />
            </div>

            <div className="ar-field">
              <label className="ar-field__label" htmlFor="psnId">{t('adminRoster.players.psnLabel', 'PSN ID')}</label>
              <input
                className="ar-input"
                type="text"
                id="psnId"
                value={formData.psnId}
                onChange={(e) => setFormData({ ...formData, psnId: e.target.value })}
                placeholder={t('adminRoster.players.psnPlaceholder', 'PlayStation Network ID')}
              />
            </div>

            <div className="ar-field">
              <label className="ar-field__label" htmlFor="wrestler">{t('adminRoster.players.wrestler', 'Wrestler')}</label>
              <select
                className="ar-input"
                id="wrestler"
                value={formData.currentWrestlerId}
                onChange={(e) => setFormData({ ...formData, currentWrestlerId: e.target.value })}
                disabled={rosterEmpty}
              >
                <option value="">{t('adminRoster.players.needsWrestler', 'Needs Wrestler — assign later')}</option>
                {renderKeptWrestlerOption(currentWrestlerOptions, initialCurrentSlot, editingPlayer?.currentWrestler)}
                {renderWrestlerOptions(currentWrestlerOptions)}
              </select>
              {clearingPrimarySlot && (
                <p className="ar-hint">
                  {t('adminRoster.players.clearWarning', 'Saving removes this wrestler and hides the player from public pages.')}
                </p>
              )}
            </div>

            <div className="ar-field">
              <label className="ar-field__label" htmlFor="alternateWrestler">
                {t('adminRoster.players.alternateLabel', 'Alternate Wrestler')}
              </label>
              <select
                className="ar-input"
                id="alternateWrestler"
                value={formData.alternateWrestlerId}
                onChange={(e) => setFormData({ ...formData, alternateWrestlerId: e.target.value })}
                disabled={rosterEmpty}
              >
                <option value="">{t('common.none', 'None')}</option>
                {renderKeptWrestlerOption(alternateWrestlerOptions, initialAlternateSlot, editingPlayer?.alternateWrestler)}
                {renderWrestlerOptions(alternateWrestlerOptions)}
              </select>
            </div>

            <div className="ar-field">
              <label className="ar-field__label" htmlFor="division">{t('adminRoster.players.division', 'Division')}</label>
              <select
                className="ar-input"
                id="division"
                value={formData.divisionId}
                onChange={(e) => setFormData({ ...formData, divisionId: e.target.value })}
              >
                <option value="">{t('adminRoster.players.noDivision', 'No Division')}</option>
                {divisions.map((division) => (
                  <option key={division.divisionId} value={division.divisionId}>{division.name}</option>
                ))}
              </select>
            </div>

            <div className="ar-field">
              <label className="ar-field__label" htmlFor="alignment">{t('adminRoster.players.alignment', 'Alignment')}</label>
              <select
                className="ar-input"
                id="alignment"
                value={formData.alignment}
                onChange={(e) => setFormData({ ...formData, alignment: e.target.value as '' | 'face' | 'heel' | 'neutral' })}
              >
                <option value="">{t('adminRoster.players.alignmentUnset', 'Not Set')}</option>
                <option value="face">{alignmentLabels.face}</option>
                <option value="neutral">{alignmentLabels.neutral}</option>
                <option value="heel">{alignmentLabels.heel}</option>
              </select>
            </div>
          </div>

          <label className="ar-check" htmlFor="canUploadVideos">
            <input
              type="checkbox"
              id="canUploadVideos"
              checked={formData.canUploadVideos}
              onChange={(e) => setFormData({ ...formData, canUploadVideos: e.target.checked })}
            />
            {t('adminRoster.players.allowVideos', 'Allow video uploads (wrestler can submit drafts via /my-videos)')}
          </label>

          <div className="ar-field">
            <span className="ar-field__label">{t('adminRoster.players.imageLabel', 'Wrestler Image')}</span>
            {imagePreview ? (
              <div className="player-image-preview">
                <img src={imagePreview} alt={t('adminRoster.players.imagePreview', 'Preview')} />
                <Button variant="ghost" size="sm" onClick={clearImage}>
                  {t('adminRoster.players.removeImage', 'Remove Image')}
                </Button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  id="image"
                  className="sr-only ar-file__input"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileSelect}
                />
                <label htmlFor="image" className="ar-file__label">
                  {t('adminRoster.players.uploadImage', 'Click to upload image')}
                </label>
                <p className="ar-hint">{FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS} (max {FILE_UPLOAD_LIMITS.MAX_SIZE_MB}MB)</p>
              </div>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={pendingDelete !== null}
        title={t('adminRoster.players.deleteTitle', 'Delete player')}
        message={t('adminRoster.players.deleteConfirm', {
          defaultValue: 'Are you sure you want to delete {{name}}? This action cannot be undone.',
          name: pendingDelete?.name ?? '',
        })}
        confirmLabel={t('common.delete', 'Delete')}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
