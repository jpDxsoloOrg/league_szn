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
  }) => Promise<void>;
  onClose: () => void;
}

export default function SlotEditDialog({ slot, players, onSave, onClose }: SlotEditDialogProps) {
  const { t } = useTranslation();
  const [playerId, setPlayerId] = useState<string>('');
  const [locked, setLocked] = useState(false);
  const [teamLabel, setTeamLabel] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync local form state when the dialog opens on a different slot.
  useEffect(() => {
    if (!slot) return;
    setPlayerId(slot.playerId ?? '');
    setLocked(!!slot.lockedByAdmin);
    setTeamLabel(slot.teamLabel ?? '');
    setErrorMsg(null);
  }, [slot]);

  if (!slot) return null;

  const buildPatch = (): {
    playerId?: string | null;
    lockedByAdmin?: boolean;
    teamLabel?: string | null;
  } => {
    const patch: { playerId?: string | null; lockedByAdmin?: boolean; teamLabel?: string | null } = {};
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
