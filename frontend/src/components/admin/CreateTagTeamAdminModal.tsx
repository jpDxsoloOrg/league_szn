import { useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, imagesApi, isApiError } from '../../services/api';
import { tagTeamsApi } from '../../services/api/tagTeams.api';
import type { Player } from '../../types';
import type { TagTeam } from '../../types/tagTeam';
import { FILE_UPLOAD_LIMITS, VALIDATION } from '../../constants';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import { logger } from '../../utils/logger';
import { sanitizeInput } from '../../utils/sanitize';
import Button from '../ui/Button';
import AdminFormModal from './AdminFormModal';
import SearchableSelect from './SearchableSelect';
import type { SearchableSelectOption } from './SearchableSelect';
import './CreateTagTeamAdminModal.css';

type MemberSlot = 'player1' | 'player2';

interface FieldErrors {
  name?: string;
  player1?: string;
  player2?: string;
}

export interface CreateTagTeamAdminModalProps {
  open: boolean;
  onClose: () => void;
  /** Every player, hidden ones included, so staff can team anyone up. */
  players: Player[];
  /** Every tag team, used to mark players who are already on an active one. */
  tagTeams: TagTeam[];
  onCreated: (tagTeam: TagTeam) => void;
  /** The list is out of date (a 409 named a team it does not show), so reload it. */
  onStale?: () => void;
}

interface ConflictingTagTeam {
  tagTeamId: string;
  name: string;
}

const readString = (details: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const value = details[key];
  return typeof value === 'string' ? value : undefined;
};

const readConflictingTeam = (details: Readonly<Record<string, unknown>>): ConflictingTagTeam | undefined => {
  const value = details['conflictingTagTeam'];
  if (typeof value !== 'object' || value === null) return undefined;
  const { tagTeamId, name } = value as Record<string, unknown>;
  return typeof tagTeamId === 'string' && typeof name === 'string' ? { tagTeamId, name } : undefined;
};

/** "Wrestler (Player)", or just the player's name before a wrestler is assigned. */
const playerOptionLabel = (player: Player): string =>
  isNeedsWrestler(player.currentWrestler) || !player.currentWrestler
    ? player.name
    : `${player.currentWrestler} (${player.name})`;

/** Staff form for a tag team that is active at once, with no partner or approval step. */
export default function CreateTagTeamAdminModal({
  open,
  onClose,
  players,
  tagTeams,
  onCreated,
  onStale,
}: CreateTagTeamAdminModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [notifyPlayers, setNotifyPlayers] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  /** Player ID to the name of the active team they are on. */
  const activeTeamByPlayer = useMemo(() => {
    const teamNames = new Map<string, string>();
    for (const team of tagTeams) {
      if (team.status !== 'active') continue;
      teamNames.set(team.player1Id, team.name);
      teamNames.set(team.player2Id, team.name);
    }
    return teamNames;
  }, [tagTeams]);

  const sortedPlayers = useMemo(
    () => [...players].sort((first, second) => playerOptionLabel(first).localeCompare(playerOptionLabel(second))),
    [players],
  );

  const optionsExcluding = (otherPlayerId: string): SearchableSelectOption[] =>
    sortedPlayers
      .filter((player) => player.playerId !== otherPlayerId)
      .map((player) => {
        const teamName = activeTeamByPlayer.get(player.playerId);
        return {
          value: player.playerId,
          label: playerOptionLabel(player),
          ...(teamName
            ? {
              disabled: true,
              hint: t('adminRoster.tagTeams.form.inTeam', { defaultValue: '(in {{team}})', team: teamName }),
            }
            : {}),
        };
      });

  const playerLabel = (playerId: string): string => {
    const player = players.find((candidate) => candidate.playerId === playerId);
    return player ? playerOptionLabel(player) : playerId;
  };

  const slotFor = (playerId: string | undefined): MemberSlot | undefined => {
    if (!playerId) return undefined;
    if (playerId === player1Id) return 'player1';
    if (playerId === player2Id) return 'player2';
    return undefined;
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!FILE_UPLOAD_LIMITS.ALLOWED_TYPES.includes(file.type as typeof FILE_UPLOAD_LIMITS.ALLOWED_TYPES[number])) {
      setFormError(t('adminContent.invalidImageType', 'Invalid file type. Only {{types}} images are allowed.', { types: FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS }));
      return;
    }
    if (file.size > FILE_UPLOAD_LIMITS.MAX_SIZE) {
      setFormError(t('adminContent.imageTooLarge', 'File too large. Maximum size is {{size}}MB.', { size: FILE_UPLOAD_LIMITS.MAX_SIZE_MB }));
      return;
    }
    setSelectedFile(file);
    setFormError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
  };

  const uploadImage = async (file: File): Promise<string> => {
    let uploadUrl: string;
    let imageUrl: string;
    try {
      ({ uploadUrl, imageUrl } = await imagesApi.generateUploadUrl(file.name, file.type, 'tag-teams'));
    } catch (err) {
      logger.error('Failed to get upload URL for tag team image');
      if (isApiError(err, 401)) {
        throw new Error(t('adminContent.sessionExpired', 'Session expired. Please log in again to upload images.'));
      }
      throw new Error(t('adminContent.uploadPrepareFailed', 'Unable to prepare image upload. Please check your connection and try again.'));
    }
    try {
      await imagesApi.uploadToS3(uploadUrl, file);
    } catch {
      logger.error('Failed to upload tag team image to storage');
      throw new Error(t('adminContent.uploadStorageFailed', 'Failed to upload image to storage. Please try again or use a different image.'));
    }
    return imageUrl;
  };

  /** Puts a refusal next to the field it is about, or at the top of the form. */
  const showRefusal = (err: ApiError) => {
    const conflictingTeam = readConflictingTeam(err.details);
    const playerId = readString(err.details, 'playerId');
    const slot = slotFor(playerId);

    if (err.code === 'TAG_TEAM_NAME_TAKEN') {
      setFieldErrors({
        name: t('adminRoster.tagTeams.form.errors.nameTaken', {
          defaultValue: 'An active tag team is already named "{{team}}".',
          team: conflictingTeam?.name ?? name.trim(),
        }),
      });
      return;
    }
    if (err.code === 'PLAYER_IN_ACTIVE_TAG_TEAM' && slot && conflictingTeam) {
      setFieldErrors({
        [slot]: t('adminRoster.tagTeams.form.errors.playerInTeam', {
          defaultValue: '{{player}} is already in the active tag team "{{team}}".',
          player: playerLabel(playerId ?? ''),
          team: conflictingTeam.name,
        }),
      });
      onStale?.();
      return;
    }
    if (err.code === 'PLAYER_NOT_FOUND' && slot) {
      setFieldErrors({
        [slot]: t('adminRoster.tagTeams.form.errors.playerNotFound', 'This player no longer exists. Pick someone else.'),
      });
      onStale?.();
      return;
    }
    if (err.code === 'CONCURRENT_UPDATE') {
      setFormError(t(
        'adminRoster.tagTeams.form.errors.concurrentUpdate',
        'One of these players changed tag teams while this team was being created. Reload and try again.',
      ));
      onStale?.();
      return;
    }
    // Discipline refusals arrive already translated by the API client.
    setFormError(err.message);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    setFieldErrors({});

    // Not sanitizeName: team names often use "&" or "!", which it strips.
    const cleanName = sanitizeInput(name, VALIDATION.MAX_NAME_LENGTH);
    const missing: FieldErrors = {};
    if (!cleanName) missing.name = t('adminRoster.tagTeams.form.errors.nameRequired', 'Enter a team name.');
    if (!player1Id) missing.player1 = t('adminRoster.tagTeams.form.errors.playerRequired', 'Pick a player.');
    if (!player2Id) missing.player2 = t('adminRoster.tagTeams.form.errors.playerRequired', 'Pick a player.');
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      return;
    }

    setSubmitting(true);
    try {
      const imageUrl = selectedFile ? await uploadImage(selectedFile) : undefined;
      const tagTeam = await tagTeamsApi.adminCreate({
        name: cleanName,
        player1Id,
        player2Id,
        notifyPlayers,
        ...(imageUrl ? { imageUrl } : {}),
      });
      onCreated(tagTeam);
    } catch (err) {
      if (err instanceof ApiError) {
        showRefusal(err);
      } else {
        setFormError(err instanceof Error
          ? err.message
          : t('adminRoster.tagTeams.form.errors.createFailed', 'Failed to create tag team'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const nameErrorId = 'tag-team-admin-name-error';
  const memberField = (slot: MemberSlot, value: string, otherValue: string, onChange: (playerId: string) => void) => {
    const inputId = `tag-team-admin-${slot}`;
    const errorId = `${inputId}-error`;
    const label = slot === 'player1'
      ? t('adminRoster.tagTeams.player1', 'Player 1')
      : t('adminRoster.tagTeams.player2', 'Player 2');
    return (
      <div className="ac-field">
        <label className="ac-field__label" htmlFor={inputId}>{label}</label>
        <SearchableSelect
          id={inputId}
          options={optionsExcluding(otherValue)}
          value={value}
          onChange={(playerId) => {
            onChange(playerId);
            setFieldErrors((previous) => ({ ...previous, [slot]: undefined }));
          }}
          placeholder={t('adminRoster.tagTeams.form.playerPlaceholder', 'Search players...')}
          errorId={fieldErrors[slot] ? errorId : undefined}
        />
        {fieldErrors[slot] && <p id={errorId} className="ttam-field-error" role="alert">{fieldErrors[slot]}</p>}
      </div>
    );
  };

  return (
    <AdminFormModal
      open={open}
      onClose={onClose}
      className="am-sheet ttam-modal"
      title={t('adminRoster.tagTeams.form.createTitle', 'Create Tag Team')}
      description={t(
        'adminRoster.tagTeams.form.createDescription',
        'The team is active at once. Pending requests involving either player are closed.',
      )}
      submitLabel={t('adminRoster.tagTeams.form.createSubmit', 'Create Tag Team')}
      onSubmit={handleSubmit}
      busy={submitting}
      error={formError}
    >
      <div className="ac-field">
        <label className="ac-field__label" htmlFor="tag-team-admin-name">
          {t('adminRoster.tagTeams.form.name', 'Team name')}
        </label>
        <input
          type="text"
          id="tag-team-admin-name"
          value={name}
          maxLength={VALIDATION.MAX_NAME_LENGTH}
          onChange={(event) => {
            setName(event.target.value);
            setFieldErrors((previous) => ({ ...previous, name: undefined }));
          }}
          placeholder={t('adminRoster.tagTeams.form.namePlaceholder', 'e.g. The Hardy Boyz')}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? nameErrorId : undefined}
        />
        {fieldErrors.name && <p id={nameErrorId} className="ttam-field-error" role="alert">{fieldErrors.name}</p>}
      </div>

      <div className="ac-form__row">
        {memberField('player1', player1Id, player2Id, setPlayer1Id)}
        {memberField('player2', player2Id, player1Id, setPlayer2Id)}
      </div>

      <div className="ac-field">
        <label className="ac-field__label" htmlFor="tag-team-admin-image">
          {t('adminRoster.tagTeams.form.image', 'Team image (optional)')}
        </label>
        {imagePreview ? (
          <div className="ac-image-preview">
            <img src={imagePreview} alt="" />
            <Button variant="ghost" size="sm" onClick={clearImage}>{t('adminContent.removeImage', 'Remove Image')}</Button>
          </div>
        ) : (
          <>
            <input
              type="file"
              id="tag-team-admin-image"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileSelect}
            />
            <p className="ac-field__hint">{FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS} (max {FILE_UPLOAD_LIMITS.MAX_SIZE_MB}MB)</p>
          </>
        )}
      </div>

      <label className="ac-check am-toggle-row">
        <input
          type="checkbox"
          className="am-toggle"
          checked={notifyPlayers}
          onChange={(event) => setNotifyPlayers(event.target.checked)}
        />
        {t('adminRoster.tagTeams.form.notifyPlayers', 'Notify players')}
      </label>
    </AdminFormModal>
  );
}
