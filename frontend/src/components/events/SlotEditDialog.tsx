import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HydratedMatchSlot, Player, PlayerBookingInfo } from '../../types';
import { pickablePlayers } from '../../utils/pickablePlayers';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PlayerBookingPicker, { type PickerCheckInStatus } from './PlayerBookingPicker';
// INJ-11
import AllowInjuredToggle from '../injuries/AllowInjuredToggle';
import InjuryWarningsNotice from '../injuries/InjuryWarningsNotice';
import type { InjuryWarning, WithInjuryWarnings } from '../../types/injuryReport';
import { buildBookingCondition, injuryRefusalMessage } from '../../utils/injuryBooking';
import './SlotEditDialog.css';

export interface SlotEditDialogProps {
  /** Slot under edit. When null, the dialog is closed. */
  slot: HydratedMatchSlot | null;
  players: Player[];
  /**
   * Per-player check-in status for the event being booked. The picker uses it
   * to show available/tentative first (colour-coded) and tuck everyone else
   * behind a "show all" toggle. Omit it and the picker lists everyone.
   */
  checkInStatusByPlayerId?: ReadonlyMap<string, PickerCheckInStatus>;
  /** Players already booked in another match on this event's card. */
  bookedPlayerIds?: ReadonlySet<string>;
  /** Last-booked / streak per player; passed straight to the picker. */
  bookingInfoByPlayerId?: ReadonlyMap<string, PlayerBookingInfo>;
  /**
   * Patch shape mirrors the adminUpdateSlot endpoint: undefined = leave alone,
   * null = clear, string = set. The dialog only fills in fields the admin
   * actually changed (so a no-op Save is a 200 no-op on the server).
   */
  onSave: (patch: {
    playerId?: string | null;
    lockedByAdmin?: boolean;
    teamLabel?: string | null;
    wrestlerChoice?: 'main' | 'alternate';
    allowInjured?: boolean;
  }) => Promise<WithInjuryWarnings | void>;
  onClose: () => void;
  /** INJ-11: the injuries feature is on, so injured players need the override. */
  injuriesEnabled?: boolean;
}

export default function SlotEditDialog({
  slot,
  players,
  checkInStatusByPlayerId,
  bookedPlayerIds,
  onSave,
  onClose,
  bookingInfoByPlayerId,
  injuriesEnabled = false,
}: SlotEditDialogProps) {
  const { t, i18n } = useTranslation();
  // INJ-11
  const [allowInjured, setAllowInjured] = useState(false);
  const [injuryWarnings, setInjuryWarnings] = useState<InjuryWarning[]>([]);
  const [playerId, setPlayerId] = useState<string>('');
  const [locked, setLocked] = useState(false);
  const [teamLabel, setTeamLabel] = useState<string>('');
  const [wrestlerChoice, setWrestlerChoice] = useState<'main' | 'alternate'>('main');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync local form state when the dialog opens on a different slot.
  useEffect(() => {
    if (!slot) return;
    setPlayerId(slot.playerId ?? '');
    setLocked(!!slot.lockedByAdmin);
    setTeamLabel(slot.teamLabel ?? '');
    setWrestlerChoice(slot.wrestlerChoice ?? 'main');
    setErrorMsg(null);
    setAllowInjured(false);
    setInjuryWarnings([]);
  }, [slot]);

  if (!slot) return null;

  // Show the Wrestler radio only when the picked player has an alternate set.
  const pickedPlayer = playerId
    ? players.find((p) => p.playerId === playerId)
    : undefined;
  const showWrestlerRadio = !!pickedPlayer?.alternateWrestler;
  const bookingCondition = buildBookingCondition(players, injuriesEnabled, allowInjured);
  const nameOf = (id: string): string | undefined => players.find((p) => p.playerId === id)?.name;

  const buildPatch = (): {
    playerId?: string | null;
    lockedByAdmin?: boolean;
    teamLabel?: string | null;
    wrestlerChoice?: 'main' | 'alternate';
    allowInjured?: boolean;
  } => {
    const patch: {
      playerId?: string | null;
      lockedByAdmin?: boolean;
      teamLabel?: string | null;
      wrestlerChoice?: 'main' | 'alternate';
      allowInjured?: boolean;
    } = {};
    const trimmedLabel = teamLabel.trim();
    const originalLabel = slot.teamLabel ?? '';

    // playerId: '' means "open" (clear). Compare against the original.
    if (playerId !== (slot.playerId ?? '')) {
      patch.playerId = playerId === '' ? null : playerId;
    }
    if (locked !== !!slot.lockedByAdmin) {
      patch.lockedByAdmin = locked;
    }
    if (trimmedLabel !== originalLabel) {
      patch.teamLabel = trimmedLabel === '' ? null : trimmedLabel;
    }
    // wrestlerChoice: include when re-assigning (so backend can default to
    // 'main' or honor 'alternate'), or when explicitly switching the radio
    // on an existing claimant. Hidden + omitted when the player has no alt.
    if (showWrestlerRadio) {
      const reassigning = patch.playerId !== undefined && patch.playerId !== null;
      const choiceChanged = wrestlerChoice !== (slot.wrestlerChoice ?? 'main');
      if (reassigning || choiceChanged) {
        patch.wrestlerChoice = wrestlerChoice;
      }
    }
    if (bookingCondition && allowInjured && typeof patch.playerId === 'string') {
      patch.allowInjured = true;
    }
    return patch;
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setSaving(true);
    try {
      const saved = await onSave(buildPatch());
      // INJ-11: an injured player booked with the override is shown before closing.
      const warnings = saved?.injuryWarnings ?? [];
      if (warnings.length > 0) setInjuryWarnings(warnings);
      else onClose();
    } catch (err) {
      setErrorMsg(
        injuryRefusalMessage(err, t, nameOf, i18n.language)
        ?? (err instanceof Error ? err.message : t('matches.slots.saveError', 'Failed to save slot')),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setErrorMsg(null);
    setSaving(true);
    try {
      await onSave({ playerId: null });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('matches.slots.clearError', 'Failed to clear slot'));
    } finally {
      setSaving(false);
    }
  };

  const closeUnlessSaving = () => {
    if (!saving) onClose();
  };

  return (
    <Modal
      open
      onClose={closeUnlessSaving}
      className="slot-edit-dialog"
      title={t('matches.slots.editTitle', {
        position: slot.position,
        defaultValue: 'Edit slot {{position}}',
      })}
      footer={injuryWarnings.length > 0 ? (
        <Button onClick={onClose}>{t('injuryReport.booking.done')}</Button>
      ) : (
        <>
          <Button className="slot-edit-dialog__clear" variant="ghost" onClick={handleClear} disabled={saving}>
            {t('matches.slots.editClear', { defaultValue: 'Clear slot' })}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </>
      )}
    >
      <div className="slot-edit-dialog__form">
        <InjuryWarningsNotice warnings={injuryWarnings} nameOf={nameOf} />
        <div className="slot-edit-dialog__row">
          <label htmlFor="slot-edit-player">
            {t('matches.slots.editPlayerLabel', { defaultValue: 'Player' })}
          </label>
          <PlayerBookingPicker
            id="slot-edit-player"
            players={pickablePlayers(players, slot.playerId ? [slot.playerId] : [])}
            value={playerId}
            onChange={setPlayerId}
            checkInStatusByPlayerId={checkInStatusByPlayerId}
            bookedPlayerIds={bookedPlayerIds}
            bookingInfoByPlayerId={bookingInfoByPlayerId}
            disabled={saving}
            condition={bookingCondition}
          />
        </div>

        {bookingCondition && (
          <AllowInjuredToggle checked={allowInjured} onChange={setAllowInjured} disabled={saving} />
        )}

        {pickedPlayer?.discipline?.status === 'signup-blocked' && (
          <p className="slot-edit-dialog__warning" role="status">
            {t('discipline.admin.bookingWarning', { names: pickedPlayer.name })}
          </p>
        )}

        {showWrestlerRadio && pickedPlayer && (
          <fieldset className="slot-edit-dialog__row slot-edit-dialog__group">
            <legend>{t('matches.slots.editWrestlerLabel', { defaultValue: 'Wrestler' })}</legend>
            <label className="slot-edit-dialog__check">
              <input
                type="radio"
                name="slot-edit-wrestler-choice"
                value="main"
                checked={wrestlerChoice === 'main'}
                disabled={saving}
                onChange={() => setWrestlerChoice('main')}
              />
              {t('matches.slots.useMain', {
                name: pickedPlayer.currentWrestler,
                defaultValue: `Use main: ${pickedPlayer.currentWrestler}`,
              })}
            </label>
            <label className="slot-edit-dialog__check">
              <input
                type="radio"
                name="slot-edit-wrestler-choice"
                value="alternate"
                checked={wrestlerChoice === 'alternate'}
                disabled={saving}
                onChange={() => setWrestlerChoice('alternate')}
              />
              {t('matches.slots.useAlternate', {
                name: pickedPlayer.alternateWrestler,
                defaultValue: `Use alternate: ${pickedPlayer.alternateWrestler}`,
              })}
            </label>
          </fieldset>
        )}

        <label className="slot-edit-dialog__check">
          <input
            type="checkbox"
            checked={locked}
            disabled={saving || !playerId}
            onChange={(e) => setLocked(e.target.checked)}
          />
          {t('matches.slots.lockToggle', { defaultValue: 'Lock' })}
        </label>

        <div className="slot-edit-dialog__row">
          <label htmlFor="slot-edit-team">
            {t('matches.slots.teamLabel', { defaultValue: 'Team label' })}
          </label>
          <input
            id="slot-edit-team"
            className="slot-edit-dialog__input"
            type="text"
            value={teamLabel}
            onChange={(e) => setTeamLabel(e.target.value)}
            disabled={saving}
            placeholder={t('matches.slots.teamLabelPlaceholder', { defaultValue: 'Team (optional)' })}
          />
        </div>

        {errorMsg && <p className="slot-edit-dialog__error" role="alert">{errorMsg}</p>}
      </div>
    </Modal>
  );
}
