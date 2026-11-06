import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Medal, Plus } from 'lucide-react';
import { championshipsApi, divisionsApi, playersApi, imagesApi, isApiError } from '../../services/api';
import { sanitizeName } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import { FILE_UPLOAD_LIMITS, VALIDATION } from '../../constants';
import {
  DEFAULT_CHAMPIONSHIP_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import type { Championship, Division, Player } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

export default function ManageChampionships() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingChampionship, setEditingChampionship] = useState<Championship | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [vacating, setVacating] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState<string | null>(null);

  // Assign-champion modal state
  const [assigningChampionship, setAssigningChampionship] = useState<Championship | null>(null);
  const [assignChampion1, setAssignChampion1] = useState('');
  const [assignChampion2, setAssignChampion2] = useState('');
  const [assigning, setAssigning] = useState(false);

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

  const loadChampionships = useCallback(async () => {
    try {
      // Include inactive titles so admins can see and reactivate them
      setChampionships(await championshipsApi.getAll(undefined, { includeInactive: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadOptions = async () => {
      // Divisions and the roster only label rows and fill pickers, so a failure here is not fatal.
      const [divisionResult, playerResult] = await Promise.allSettled([
        divisionsApi.getAll(),
        playersApi.getAllIncludingHidden(),
      ]);
      if (divisionResult.status === 'fulfilled') setDivisions(divisionResult.value);
      if (playerResult.status === 'fulfilled') setPlayers(playerResult.value);
    };
    void loadChampionships();
    void loadOptions();
  }, [loadChampionships]);

  const getChampionName = (currentChampion?: string | string[]): string => {
    if (!currentChampion) return t('common.vacant', 'Vacant');
    const ids = Array.isArray(currentChampion) ? currentChampion : [currentChampion];
    const names = ids.map(id => {
      const player = players.find(p => p.playerId === id);
      return player ? player.name : t('common.unknown', 'Unknown');
    });
    return names.join(' & ');
  };

  const getDivisionName = (divisionId?: string) => {
    if (!divisionId) return t('common.none', 'None');
    const division = divisions.find((d) => d.divisionId === divisionId);
    return division ? division.name : t('common.unknown', 'Unknown');
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!FILE_UPLOAD_LIMITS.ALLOWED_TYPES.includes(file.type as typeof FILE_UPLOAD_LIMITS.ALLOWED_TYPES[number])) {
        setFormError(t('adminContent.invalidImageType', 'Invalid file type. Only {{types}} images are allowed.', { types: FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS }));
        return;
      }

      // Validate file size
      if (file.size > FILE_UPLOAD_LIMITS.MAX_SIZE) {
        setFormError(t('adminContent.imageTooLarge', 'File too large. Maximum size is {{size}}MB.', { size: FILE_UPLOAD_LIMITS.MAX_SIZE_MB }));
        return;
      }

      setSelectedFile(file);
      setFormError(null);

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
        if (isApiError(err, 401)) {
          throw new Error(t('adminContent.sessionExpired', 'Session expired. Please log in again to upload images.'));
        }
        throw new Error(t('adminContent.uploadPrepareFailed', 'Unable to prepare image upload. Please check your connection and try again.'));
      }

      // Upload to S3 with specific error handling
      try {
        await imagesApi.uploadToS3(uploadUrl, selectedFile);
      } catch (err) {
        logger.error('Failed to upload championship image to storage');
        if (err instanceof TypeError && err.message.includes('network')) {
          throw new Error(t('adminContent.uploadNetworkError', 'Network error during upload. Please check your internet connection and try again.'));
        }
        throw new Error(t('adminContent.uploadStorageFailed', 'Failed to upload image to storage. Please try again or use a different image.'));
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
    setFormError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      // Sanitize inputs before sending to API
      const sanitizedName = sanitizeName(formData.name, VALIDATION.MAX_NAME_LENGTH);

      if (!sanitizedName) {
        setFormError(t('adminContent.championships.nameRequired', 'Championship name cannot be empty'));
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
        setSuccess(t('adminContent.championships.updated', 'Championship updated successfully!'));
      } else {
        await championshipsApi.create({
          name: sanitizedName,
          type: formData.type,
          divisionId: formData.divisionId || undefined,
          imageUrl: imageUrl || undefined,
          isActive: true,
        });
        setSuccess(t('adminContent.championships.created', 'Championship created successfully!'));
      }

      handleCancel();
      await loadChampionships();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('adminContent.championships.saveFailed', 'Failed to save championship'));
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
    setFormError(null);
  };

  const handleDelete = async (championshipId: string, championshipName: string) => {
    const confirmed = await confirm({
      title: t('adminContent.deletePrompt', 'Delete {{name}}?', { name: championshipName }),
      description: t('adminContent.championships.deleteText', 'This also deletes all championship history. This cannot be undone.'),
      confirmLabel: t('common.delete', 'Delete'),
    });
    if (!confirmed) return;

    setDeleting(championshipId);
    setError(null);
    setSuccess(null);

    try {
      await championshipsApi.delete(championshipId);
      setSuccess(t('adminContent.championships.deleted', 'Championship deleted successfully!'));
      await loadChampionships();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.championships.deleteFailed', 'Failed to delete championship'));
    } finally {
      setDeleting(null);
    }
  };

  const handleVacate = async (championshipId: string, championshipName: string) => {
    const confirmed = await confirm({
      title: t('adminContent.championships.vacateTitle', 'Vacate {{name}}?', { name: championshipName }),
      description: t('adminContent.championships.vacateText', 'The current champion will be stripped of the title.'),
      confirmLabel: t('adminContent.championships.vacate', 'Vacate'),
    });
    if (!confirmed) return;

    setVacating(championshipId);
    setError(null);
    setSuccess(null);

    try {
      await championshipsApi.vacate(championshipId);
      setSuccess(t('adminContent.championships.vacated', 'Championship vacated successfully!'));
      await loadChampionships();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.championships.vacateFailed', 'Failed to vacate championship'));
    } finally {
      setVacating(null);
    }
  };

  const handleToggleActive = async (championship: Championship) => {
    const isCurrentlyActive = championship.isActive !== false;
    if (isCurrentlyActive) {
      const confirmed = await confirm({
        title: t('adminContent.championships.deactivateTitle', 'Deactivate {{name}}?', { name: championship.name }),
        description: t('adminContent.championships.deactivateText', 'It will no longer be available for new matches or challenges, but its title history stays visible.'),
        confirmLabel: t('adminContent.championships.deactivate', 'Deactivate'),
      });
      if (!confirmed) return;
    }

    setTogglingActive(championship.championshipId);
    setError(null);
    setSuccess(null);

    try {
      await championshipsApi.update(championship.championshipId, { isActive: !isCurrentlyActive });
      setSuccess(isCurrentlyActive
        ? t('adminContent.championships.deactivated', 'Championship deactivated.')
        : t('adminContent.championships.reactivated', 'Championship reactivated.'));
      await loadChampionships();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.championships.statusFailed', 'Failed to update championship status'));
    } finally {
      setTogglingActive(null);
    }
  };

  const openAssignChampion = (championship: Championship) => {
    setAssigningChampionship(championship);
    setAssignChampion1('');
    setAssignChampion2('');
    setAssignError(null);
    setError(null);
    setSuccess(null);
  };

  const closeAssignChampion = () => {
    if (assigning) return;
    setAssigningChampionship(null);
  };

  const handleAssignChampion = async (e: FormEvent) => {
    e.preventDefault();
    if (!assigningChampionship || assigning) return;

    const isTag = assigningChampionship.type === 'tag';
    if (!assignChampion1 || (isTag && !assignChampion2)) {
      setAssignError(isTag
        ? t('adminContent.championships.selectBoth', 'Select both tag team champions')
        : t('adminContent.championships.selectOne', 'Select a champion'));
      return;
    }
    if (isTag && assignChampion1 === assignChampion2) {
      setAssignError(t('adminContent.championships.differentPlayers', 'Tag team champions must be two different players'));
      return;
    }

    setAssigning(true);
    setAssignError(null);
    setSuccess(null);

    try {
      const champion = isTag ? [assignChampion1, assignChampion2] : assignChampion1;
      await championshipsApi.assignChampion(assigningChampionship.championshipId, champion);
      setSuccess(t('adminContent.championships.assigned', 'Champion assigned successfully!'));
      setAssigningChampionship(null);
      await loadChampionships();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : t('adminContent.championships.assignFailed', 'Failed to assign champion'));
    } finally {
      setAssigning(false);
    }
  };

  const title = t('adminContent.championships.title', 'Manage Championships');
  const assignLabel = t('adminContent.championships.assign', 'Assign Champion');

  if (loading) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <Skeleton variant="table" />
      </div>
    );
  }

  const isTagAssignment = assigningChampionship?.type === 'tag';

  return (
    <div className="ac-page">
      <PageHeader
        title={title}
        actions={(
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowAddForm(true)}>
            {t('adminContent.championships.create', 'Create Championship')}
          </Button>
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <section className="ac-section">
        <h2 className="ac-section__title">
          {t('adminContent.championships.all', 'All Championships')} ({championships.length})
        </h2>
        <DataTable
          caption={t('adminContent.championships.all', 'All Championships')}
          density="dense"
          rows={championships}
          rowKey={(championship) => championship.championshipId}
          empty={(
            <EmptyState
              icon={<Medal aria-hidden="true" size={32} />}
              title={t('adminContent.championships.emptyTitle', 'No championships yet')}
              description={t('adminContent.championships.emptyText', 'Create your first championship.')}
            />
          )}
          columns={[
            {
              key: 'name',
              header: t('adminContent.championships.championship', 'Championship'),
              render: (championship) => (
                <span className="ac-cell">
                  <img
                    src={resolveImageSrc(championship.imageUrl, DEFAULT_CHAMPIONSHIP_IMAGE)}
                    onError={(event) => applyImageFallback(event, DEFAULT_CHAMPIONSHIP_IMAGE)}
                    alt={championship.name}
                    className="ac-thumb"
                  />
                  <span className="ac-cell__text">
                    <span className="ac-cell__title">{championship.name}</span>
                    <span className="ac-cell__sub">
                      {championship.type === 'singles' ? t('championships.singles', 'Singles') : t('championships.tagTeam', 'Tag Team')}
                    </span>
                  </span>
                </span>
              ),
              sortValue: (championship) => championship.name,
            },
            {
              key: 'division',
              header: t('adminContent.championships.division', 'Division'),
              render: (championship) => getDivisionName(championship.divisionId),
            },
            {
              key: 'champion',
              header: t('adminContent.championships.champion', 'Champion'),
              render: (championship) => getChampionName(championship.currentChampion),
            },
            {
              key: 'status',
              header: t('adminContent.status', 'Status'),
              render: (championship) => (
                <Badge tone={championship.isActive !== false ? 'win' : 'neutral'}>
                  {championship.isActive !== false ? t('common.active', 'Active') : t('championships.inactive', 'Inactive')}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: t('common.actions', 'Actions'),
              align: 'end',
              render: (championship) => (
                <div className="ac-actions ac-actions--end">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(championship)}>{t('common.edit', 'Edit')}</Button>
                  <Button variant="ghost" size="sm" onClick={() => openAssignChampion(championship)}>{assignLabel}</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={togglingActive === championship.championshipId}
                    onClick={() => handleToggleActive(championship)}
                  >
                    {championship.isActive !== false
                      ? t('adminContent.championships.deactivate', 'Deactivate')
                      : t('adminContent.championships.activate', 'Activate')}
                  </Button>
                  {championship.currentChampion && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={vacating === championship.championshipId}
                      onClick={() => handleVacate(championship.championshipId, championship.name)}
                    >
                      {t('adminContent.championships.vacate', 'Vacate')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deleting === championship.championshipId}
                    onClick={() => handleDelete(championship.championshipId, championship.name)}
                  >
                    {t('common.delete', 'Delete')}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </section>

      <AdminFormModal
        open={showAddForm}
        onClose={handleCancel}
        title={editingChampionship
          ? t('adminContent.championships.edit', 'Edit Championship')
          : t('adminContent.championships.createNew', 'Create New Championship')}
        submitLabel={editingChampionship
          ? t('adminContent.championships.update', 'Update Championship')
          : t('adminContent.championships.create', 'Create Championship')}
        onSubmit={handleSubmit}
        busy={submitting || uploading}
        error={formError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="championship-name">{t('adminContent.championships.name', 'Championship Name')}</label>
          <input
            type="text"
            id="championship-name"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            required
            placeholder={t('adminContent.championships.namePlaceholder', 'World Heavyweight Championship')}
          />
        </div>
        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="championship-type">{t('adminContent.championships.type', 'Type')}</label>
            <select
              id="championship-type"
              value={formData.type}
              onChange={(event) => setFormData({ ...formData, type: event.target.value as 'singles' | 'tag' })}
              required
            >
              <option value="singles">{t('championships.singles', 'Singles')}</option>
              <option value="tag">{t('championships.tagTeam', 'Tag Team')}</option>
            </select>
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="championship-division">
              {t('adminContent.championships.divisionField', 'Division (locks contenders to this division)')}
            </label>
            <select
              id="championship-division"
              value={formData.divisionId}
              onChange={(event) => setFormData({ ...formData, divisionId: event.target.value })}
            >
              <option value="">{t('adminContent.championships.noDivision', 'No Division (Open to all)')}</option>
              {divisions.map((division) => (
                <option key={division.divisionId} value={division.divisionId}>{division.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="championship-image">{t('adminContent.championships.image', 'Championship Belt Image')}</label>
          {imagePreview ? (
            <div className="ac-image-preview">
              <img src={imagePreview} alt="" />
              <Button variant="ghost" size="sm" onClick={clearImage}>{t('adminContent.removeImage', 'Remove Image')}</Button>
            </div>
          ) : (
            <>
              <input
                type="file"
                id="championship-image"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileSelect}
              />
              <p className="ac-field__hint">{FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS} (max {FILE_UPLOAD_LIMITS.MAX_SIZE_MB}MB)</p>
            </>
          )}
        </div>
      </AdminFormModal>

      <AdminFormModal
        open={assigningChampionship !== null}
        onClose={closeAssignChampion}
        title={`${assignLabel}: ${assigningChampionship?.name ?? ''}`}
        description={t(
          'adminContent.championships.assignHint',
          'Crown a champion directly without a match. The current reign (if any) will be closed and the new reign recorded in the title history.',
        )}
        submitLabel={assignLabel}
        onSubmit={handleAssignChampion}
        busy={assigning}
        error={assignError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="assign-champion-1">
            {isTagAssignment
              ? t('adminContent.championships.champion1', 'Champion 1')
              : t('adminContent.championships.newChampion', 'New Champion')}
          </label>
          <select id="assign-champion-1" value={assignChampion1} onChange={(event) => setAssignChampion1(event.target.value)} required>
            <option value="">{t('adminContent.selectPlayer', 'Select a player')}</option>
            {players.map((player) => (
              <option key={player.playerId} value={player.playerId}>{player.name}</option>
            ))}
          </select>
        </div>
        {isTagAssignment && (
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="assign-champion-2">{t('adminContent.championships.champion2', 'Champion 2')}</label>
            <select id="assign-champion-2" value={assignChampion2} onChange={(event) => setAssignChampion2(event.target.value)} required>
              <option value="">{t('adminContent.selectPlayer', 'Select a player')}</option>
              {players
                .filter((player) => player.playerId !== assignChampion1)
                .map((player) => (
                  <option key={player.playerId} value={player.playerId}>{player.name}</option>
                ))}
            </select>
          </div>
        )}
      </AdminFormModal>

      {confirmDialog}
    </div>
  );
}
