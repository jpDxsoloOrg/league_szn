import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { imagesApi, isApiError, overallsApi, profileApi, wrestlersApi } from '../../services/api';
import { WRESTLER_NAME_ENTRY_MODE } from '../../config/wrestlerNameEntry';
import { FILE_UPLOAD_LIMITS, VALIDATION } from '../../constants';
import { compactMoves, movesEqual, padMoves } from '../../utils/movesets';
import { isNeedsWrestler, NEEDS_WRESTLER } from '../../utils/needsWrestler';
import { logger } from '../../utils/logger';
import { sanitizeName } from '../../utils/sanitize';
import { buildWrestlerOptionGroups } from '../../utils/wrestlerOptions';
import type { WrestlerSlotOptions } from '../../utils/wrestlerOptions';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import Card from '../ui/Card';
import type { Player, Wrestler, WrestlerMove, WrestlerOverall } from '../../types';
import { MAX_BIO_LENGTH } from '../../types';
import MovesetEditor from './MovesetEditor';

type Alignment = '' | 'face' | 'heel' | 'neutral';

interface ProfileEditFormProps {
  player: Player;
  overall: WrestlerOverall | null;
  onCancel: () => void;
  onSaved: (updated: Player, overall: WrestlerOverall | null) => Promise<void>;
}

const OVERALL_MIN = 60;
const OVERALL_MAX = 99;

function isValidOverall(value: number): boolean {
  return !Number.isNaN(value) && value >= OVERALL_MIN && value <= OVERALL_MAX;
}

/**
 * Edit form for the signed-in player's own profile. In text mode a wrestler
 * is typed as free text; in roster mode it is picked from the curated roster
 * and the backend copies the name from the selected row.
 */
export default function ProfileEditForm({ player, overall, onCancel, onSaved }: ProfileEditFormProps) {
  const { t } = useTranslation();
  const textWrestlerEntry = WRESTLER_NAME_ENTRY_MODE === 'text';
  const needsWrestler = isNeedsWrestler(player.currentWrestler);

  const [formData, setFormData] = useState({
    name: player.name,
    currentWrestlerId: player.currentWrestlerId || '',
    alternateWrestlerId: player.alternateWrestlerId || '',
    currentWrestler: needsWrestler ? '' : player.currentWrestler,
    alternateWrestler: player.alternateWrestler || '',
    imageUrl: player.imageUrl || '',
    psnId: player.psnId || '',
    alignment: (player.alignment || '') as Alignment,
    bio: player.bio || '',
    signatures: padMoves(player.signatures),
    finishers: padMoves(player.finishers),
  });
  const [overallForm, setOverallForm] = useState({
    mainOverall: overall ? String(overall.mainOverall) : '',
    alternateOverall: overall?.alternateOverall !== undefined ? String(overall.alternateOverall) : '',
  });
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(player.imageUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (textWrestlerEntry) return;
    const loadRoster = async () => {
      try {
        setWrestlers(await wrestlersApi.getAll());
      } catch {
        // Without the roster the dropdowns stay empty and a notice says why.
      }
    };
    void loadRoster();
  }, [textWrestlerEntry]);

  const currentWrestlerOptions = useMemo(
    () => buildWrestlerOptionGroups(wrestlers, formData.currentWrestlerId || undefined, formData.alternateWrestlerId || undefined),
    [wrestlers, formData.currentWrestlerId, formData.alternateWrestlerId],
  );
  const alternateWrestlerOptions = useMemo(
    () => buildWrestlerOptionGroups(wrestlers, formData.alternateWrestlerId || undefined, formData.currentWrestlerId || undefined),
    [wrestlers, formData.currentWrestlerId, formData.alternateWrestlerId],
  );

  const renderWrestlerOptions = (groups: WrestlerSlotOptions) =>
    groups.map((group) => (
      <optgroup key={group.promotion} label={group.promotion}>
        {group.wrestlers.map((wrestler) => (
          <option key={wrestler.wrestlerId} value={wrestler.wrestlerId}>
            {wrestler.name} — OVR {wrestler.overallCap}
          </option>
        ))}
      </optgroup>
    ));

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!FILE_UPLOAD_LIMITS.ALLOWED_TYPES.includes(file.type as typeof FILE_UPLOAD_LIMITS.ALLOWED_TYPES[number])) {
      setError(t('me.profile.invalidFileType', { types: FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS }));
      return;
    }
    if (file.size > FILE_UPLOAD_LIMITS.MAX_SIZE) {
      setError(t('me.profile.fileTooLarge', { size: FILE_UPLOAD_LIMITS.MAX_SIZE_MB }));
      return;
    }

    setSelectedFile(file);
    setError(null);

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, imageUrl: '' }));
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!selectedFile) return formData.imageUrl || null;

    try {
      setUploading(true);

      let uploadUrl: string;
      let imageUrl: string;
      try {
        const response = await imagesApi.generateUploadUrl(selectedFile.name, selectedFile.type, 'wrestlers');
        uploadUrl = response.uploadUrl;
        imageUrl = response.imageUrl;
      } catch (err) {
        logger.error('Failed to get upload URL for profile image');
        throw new Error(isApiError(err, 401) ? t('me.profile.sessionExpired') : t('me.profile.uploadPrepareFailed'));
      }

      try {
        await imagesApi.uploadToS3(uploadUrl, selectedFile);
      } catch (err) {
        logger.error('Failed to upload profile image to storage');
        const isNetworkError = err instanceof TypeError && err.message.includes('network');
        throw new Error(isNetworkError ? t('me.profile.uploadNetworkFailed') : t('me.profile.uploadFailed'));
      }

      return imageUrl;
    } finally {
      setUploading(false);
    }
  };

  const saveOverall = async (): Promise<WrestlerOverall | null> => {
    if (!overallForm.mainOverall) return overall;
    const main = parseInt(overallForm.mainOverall, 10);
    const alternate = overallForm.alternateOverall ? parseInt(overallForm.alternateOverall, 10) : undefined;
    if (!isValidOverall(main) || (alternate !== undefined && !isValidOverall(alternate))) return overall;
    return overallsApi.submitOverall({ mainOverall: main, alternateOverall: alternate });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || uploading) return;

    setError(null);
    setSubmitting(true);

    try {
      const imageUrl = await uploadImage();
      const sanitizedName = sanitizeName(formData.name, VALIDATION.MAX_NAME_LENGTH);

      if (!sanitizedName) {
        setError(t('me.profile.nameRequired'));
        return;
      }

      // A wrestler is not required: a player with none stays on the "Needs
      // Wrestler" placeholder and can still edit the rest of their profile.
      const updates: Parameters<typeof profileApi.updateMyProfile>[0] = { name: sanitizedName };

      if (textWrestlerEntry) {
        // Send only the names. The FK fields are deliberately omitted: the
        // backend lets an FK on a slot win over the text, and omitting them
        // also leaves any existing roster assignment untouched rather than
        // releasing it. Blank falls back to the placeholder rather than '',
        // matching what clearing the FK stamps server-side.
        updates.currentWrestler = formData.currentWrestler.trim() || NEEDS_WRESTLER;
        updates.alternateWrestler = formData.alternateWrestler.trim();
      } else {
        updates.currentWrestlerId = formData.currentWrestlerId;
        // An empty string clears the FK server-side.
        updates.alternateWrestlerId = formData.alternateWrestlerId || '';
      }

      if (imageUrl) updates.imageUrl = imageUrl;
      if (formData.psnId.trim()) updates.psnId = formData.psnId.trim();
      updates.alignment = formData.alignment || '';

      // Moveset fields go only when changed so an untouched save stays a
      // no-op for them and never resets what an admin may have entered.
      const bio = formData.bio.trim();
      if (bio !== (player.bio ?? '')) updates.bio = bio;
      if (!movesEqual(formData.signatures, player.signatures)) {
        updates.signatures = compactMoves(formData.signatures);
      }
      if (!movesEqual(formData.finishers, player.finishers)) {
        updates.finishers = compactMoves(formData.finishers);
      }

      const updated = await profileApi.updateMyProfile(updates);
      const savedOverall = await saveOverall();
      await onSaved(updated, savedOverall);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('me.profile.updateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const alignmentOptions: Array<{ value: Alignment; label: string }> = [
    { value: '', label: t('me.profile.alignmentUnset') },
    { value: 'face', label: t('profile.mobile.face') },
    { value: 'neutral', label: t('profile.mobile.neutral') },
    { value: 'heel', label: t('profile.mobile.heel') },
  ];

  const rosterEmpty = wrestlers.length === 0;
  const busy = submitting || uploading;
  let saveLabel = t('me.profile.save');
  if (submitting) saveLabel = t('common.saving');
  if (uploading) saveLabel = t('me.profile.uploading');

  return (
    <form onSubmit={handleSubmit} className="profile-form">
      <section className="profile-section" aria-labelledby="profile-identity-title">
        <h2 className="profile-section__title" id="profile-identity-title">{t('me.profile.identity')}</h2>
        <Card>
          {textWrestlerEntry ? (
            <>
              <div className="me-field">
                <label htmlFor="profile-wrestler-name">{t('me.profile.currentWrestler')}</label>
                <input
                  type="text"
                  id="profile-wrestler-name"
                  value={formData.currentWrestler}
                  onChange={(e) => setFormData({ ...formData, currentWrestler: e.target.value })}
                  maxLength={VALIDATION.MAX_NAME_LENGTH}
                  placeholder={t('profileModal.wrestlerPlaceholder')}
                  aria-describedby={needsWrestler ? 'profile-wrestler-hint' : undefined}
                  autoFocus={needsWrestler}
                />
                {needsWrestler && (
                  <p className="me-hint" id="profile-wrestler-hint">{t('me.setup.wrestlerHint')}</p>
                )}
              </div>

              <div className="me-field">
                <label htmlFor="profile-alternate-wrestler-name">{t('profile.alternateWrestler')}</label>
                <input
                  type="text"
                  id="profile-alternate-wrestler-name"
                  value={formData.alternateWrestler}
                  onChange={(e) => setFormData({ ...formData, alternateWrestler: e.target.value })}
                  maxLength={VALIDATION.MAX_NAME_LENGTH}
                  placeholder={t('me.profile.optional')}
                />
              </div>
            </>
          ) : (
            <>
              {rosterEmpty && <p className="me-alert">{t('me.profile.rosterEmpty')}</p>}

              <div className="me-field">
                <label htmlFor="profile-wrestler">{t('me.profile.currentWrestler')}</label>
                <select
                  id="profile-wrestler"
                  value={formData.currentWrestlerId}
                  onChange={(e) => setFormData({ ...formData, currentWrestlerId: e.target.value })}
                  disabled={rosterEmpty}
                  autoFocus={needsWrestler}
                >
                  <option value="">{t('me.profile.noWrestlerPicked')}</option>
                  {renderWrestlerOptions(currentWrestlerOptions)}
                </select>
              </div>

              <div className="me-field">
                <label htmlFor="profile-alternate-wrestler">{t('profile.alternateWrestler')}</label>
                <select
                  id="profile-alternate-wrestler"
                  value={formData.alternateWrestlerId}
                  onChange={(e) => setFormData({ ...formData, alternateWrestlerId: e.target.value })}
                  disabled={rosterEmpty}
                >
                  <option value="">{t('common.none')}</option>
                  {renderWrestlerOptions(alternateWrestlerOptions)}
                </select>
              </div>
            </>
          )}

          <div className="me-field">
            <label htmlFor="profile-name">{t('me.profile.playerName')}</label>
            <input
              type="text"
              id="profile-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder={t('profileModal.playerNamePlaceholder')}
            />
          </div>

          <div className="me-field">
            <label htmlFor="profile-psn">{t('profileModal.psnId')}</label>
            <input
              type="text"
              id="profile-psn"
              value={formData.psnId}
              onChange={(e) => setFormData({ ...formData, psnId: e.target.value })}
              placeholder={t('profileModal.psnIdPlaceholder')}
            />
          </div>

          <fieldset className="profile-alignment">
            <legend className="me-field__label">{t('profile.mobile.alignment')}</legend>
            <div className="profile-alignment__options">
              {alignmentOptions.map(({ value, label }) => (
                <label key={value || 'unset'} className="profile-alignment__option">
                  <input
                    type="radio"
                    name="alignment"
                    value={value}
                    checked={formData.alignment === value}
                    onChange={() => setFormData({ ...formData, alignment: value })}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="me-hint">{t('me.profile.alignmentHint')}</p>
          </fieldset>
        </Card>
      </section>

      <section className="profile-section" aria-labelledby="profile-moves-edit-title">
        <h2 className="profile-section__title" id="profile-moves-edit-title">{t('publicProfile.moveset')}</h2>
        <Card>
          <div className="me-field">
            <label htmlFor="profile-bio">{t('profile.bio.label')}</label>
            <textarea
              id="profile-bio"
              value={formData.bio}
              maxLength={MAX_BIO_LENGTH}
              rows={4}
              placeholder={t('profile.bio.placeholder')}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            />
            <p className="me-hint">
              {t('profile.bio.counter', { count: formData.bio.length, max: MAX_BIO_LENGTH })}
            </p>
          </div>

          <MovesetEditor
            label={t('profile.moves.signatures')}
            helperText={t('profile.moves.helperSignature')}
            idPrefix="profile-signature"
            value={formData.signatures}
            onChange={(signatures: WrestlerMove[]) => setFormData({ ...formData, signatures })}
          />
          <MovesetEditor
            label={t('profile.moves.finishers')}
            helperText={t('profile.moves.helperFinisher')}
            idPrefix="profile-finisher"
            value={formData.finishers}
            onChange={(finishers: WrestlerMove[]) => setFormData({ ...formData, finishers })}
          />
        </Card>
      </section>

      <section className="profile-section" aria-labelledby="profile-extras-title">
        <h2 className="profile-section__title" id="profile-extras-title">{t('me.profile.overallsAndImage')}</h2>
        <Card>
          <div className="profile-form__pair">
            <div className="me-field">
              <label htmlFor="main-overall">{t('overalls.profile.mainOverall')}</label>
              <input
                type="number"
                id="main-overall"
                min={OVERALL_MIN}
                max={OVERALL_MAX}
                value={overallForm.mainOverall}
                onChange={(e) => setOverallForm({ ...overallForm, mainOverall: e.target.value })}
                placeholder={`${OVERALL_MIN}–${OVERALL_MAX}`}
              />
            </div>
            <div className="me-field">
              <label htmlFor="alt-overall">{t('overalls.profile.altOverall')}</label>
              <input
                type="number"
                id="alt-overall"
                min={OVERALL_MIN}
                max={OVERALL_MAX}
                value={overallForm.alternateOverall}
                onChange={(e) => setOverallForm({ ...overallForm, alternateOverall: e.target.value })}
                placeholder={`${OVERALL_MIN}–${OVERALL_MAX}`}
              />
            </div>
          </div>

          <div className="me-field">
            <label htmlFor="profile-image">{t('me.profile.image')}</label>
            {imagePreview ? (
              <div className="profile-image-edit">
                <Avatar src={imagePreview} name={formData.name} size="lg" />
                <Button variant="secondary" size="sm" onClick={clearImage}>{t('me.profile.imageRemove')}</Button>
              </div>
            ) : (
              <>
                <input
                  type="file"
                  id="profile-image"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileSelect}
                />
                <p className="me-hint">
                  {t('me.profile.imageHint', {
                    types: FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS,
                    size: FILE_UPLOAD_LIMITS.MAX_SIZE_MB,
                  })}
                </p>
              </>
            )}
          </div>
        </Card>
      </section>

      {error && <p className="me-alert me-alert--error" role="alert">{error}</p>}

      <div className="profile-form__actions">
        <Button type="submit" loading={busy}>{saveLabel}</Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}
