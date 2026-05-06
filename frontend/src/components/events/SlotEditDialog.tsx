import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HydratedMatchSlot, Player } from '../../types';
import './SlotEditDialog.css';

export interface SlotEditDialogProps {
  /** Slot under edit. When null, the dialog is closed. */
  slot: HydratedMatchSlot | null;
  players: Player[];
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
  }) => Promise<void>;
  onClose: () => void;
}

export default function SlotEditDialog({ slot, players, onSave, onClose }: SlotEditDialogProps) {
  const { t } = useTranslation();
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
  }, [slot]);

  if (!slot) return null;

  // Show the Wrestler radio only when the picked player has an alternate set.
  const pickedPlayer = playerId
    ? players.find((p) => p.playerId === playerId)
    : undefined;
  const showWrestlerRadio = !!pickedPlayer?.alternateWrestler;

  const buildPatch = (): {
    playerId?: string | null;
    lockedByAdmin?: boolean;
    teamLabel?: string | null;
    wrestlerChoice?: 'main' | 'alternate';
  } => {
    const patch: {
      playerId?: string | null;
      lockedByAdmin?: boolean;
      teamLabel?: string | null;
      wrestlerChoice?: 'main' | 'alternate';
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
    return patch;
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setSaving(true);
    try {
      await onSave(buildPatch());
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save slot');
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
      setErrorMsg(err instanceof Error ? err.message : 'Failed to clear slot');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="slot-edit-dialog-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="slot-edit-dialog">
        <h3>
          {t('matches.slots.editTitle', {
            position: slot.position,
            defaultValue: 'Edit slot {{position}}',
          })}
        </h3>

        <div className="slot-edit-dialog-row">
          <label htmlFor="slot-edit-player">
            {t('matches.slots.editPlayerLabel', { defaultValue: 'Player' })}
          </label>
          <select
            id="slot-edit-player"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            disabled={saving}
          >
            <option value="">
              {t('matches.slots.openOption', { defaultValue: '— Open spot —' })}
            </option>
            {players.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.currentWrestler} ({p.name})
              </option>
            ))}
          </select>
        </div>

        {showWrestlerRadio && pickedPlayer && (
          <div className="slot-edit-dialog-row">
            <label>
              {t('matches.slots.editWrestlerLabel', { defaultValue: 'Wrestler' })}
            </label>
            <div className="slot-edit-dialog-wrestler-options">
              <label className="slot-edit-dialog-checkbox">
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
              <label className="slot-edit-dialog-checkbox">
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
            </div>
          </div>
        )}

        <div className="slot-edit-dialog-row">
          <label className="slot-edit-dialog-checkbox">
            <input
              type="checkbox"
              checked={locked}
              disabled={saving || !playerId}
              onChange={(e) => setLocked(e.target.checked)}
            />
            {t('matches.slots.lockToggle', { defaultValue: 'Lock' })}
          </label>
        </div>

        <div className="slot-edit-dialog-row">
          <label htmlFor="slot-edit-team">
            {t('matches.slots.teamLabel', { defaultValue: 'Team label' })}
          </label>
          <input
            id="slot-edit-team"
            type="text"
            value={teamLabel}
            onChange={(e) => setTeamLabel(e.target.value)}
            disabled={saving}
            placeholder={t('matches.slots.teamLabelPlaceholder', { defaultValue: 'Team (optional)' })}
          />
        </div>

        {errorMsg && <div className="slot-edit-dialog-error">{errorMsg}</div>}

        <div className="slot-edit-dialog-actions">
          <button type="button" className="slot-edit-dialog-clear" onClick={handleClear} disabled={saving}>
            {t('matches.slots.editClear', { defaultValue: 'Clear slot' })}
          </button>
          <button type="button" className="slot-edit-dialog-cancel" onClick={onClose} disabled={saving}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="button" className="slot-edit-dialog-save" onClick={handleSave} disabled={saving}>
            {saving
              ? t('common.saving', { defaultValue: 'Saving…' })
              : t('common.save', { defaultValue: 'Save' })}
          </button>
        </div>
      </div>
    </div>
  );
}
