import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { playersApi } from '../../services/api';
import type { Player, SuspendPlayerInput } from '../../types';
import { tomorrowUtc } from './suspensionFormat';
import './SuspensionDialogs.css';

export type SuspensionDialogPlayer = Pick<Player, 'playerId' | 'name' | 'currentWrestler' | 'imageUrl'>;

export interface SuspendPlayerDialogProps {
  player: SuspensionDialogPlayer;
  onSuccess: (updated: Player) => void;
  onClose: () => void;
}

const MIN_SHOWS = 1;
const MAX_SHOWS = 52;

type Condition = 'date' | 'shows';

export function PlayerHeader({ player }: { player: SuspensionDialogPlayer }) {
  return (
    <div className="suspension-dialog-player">
      {player.imageUrl ? (
        <img className="suspension-dialog-avatar" src={player.imageUrl} alt="" />
      ) : (
        <span className="suspension-dialog-avatar-placeholder" aria-hidden="true">
          {player.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="suspension-dialog-player-text">
        <span className="suspension-dialog-wrestler">{player.currentWrestler}</span>
        <span className="suspension-dialog-name">{player.name}</span>
      </span>
    </div>
  );
}

export default function SuspendPlayerDialog({ player, onSuccess, onClose }: SuspendPlayerDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLFormElement>(null);
  const [condition, setCondition] = useState<Condition>('date');
  const [until, setUntil] = useState('');
  const [shows, setShows] = useState(String(MIN_SHOWS));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const minDate = tomorrowUtc();

  // Land keyboard and screen-reader focus inside the modal on open.
  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>('input');
    (first ?? root.querySelector<HTMLElement>('h3'))?.focus();
  }, []);

  const showsNumber = Number.parseInt(shows, 10);
  const showsValid = Number.isInteger(showsNumber) && showsNumber >= MIN_SHOWS && showsNumber <= MAX_SHOWS;
  const canSubmit = condition === 'date' ? until >= minDate : showsValid;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setErrorMsg(null);
    setSaving(true);
    const input: SuspendPlayerInput = condition === 'date' ? { until } : { showsRequired: showsNumber };
    const trimmedReason = reason.trim();
    if (trimmedReason) input.reason = trimmedReason;
    try {
      const updated = await playersApi.suspend(player.playerId, input);
      onSuccess(updated);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('admin.suspensions.error'));
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !saving) onClose();
  };

  return (
    <div
      className="suspension-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="suspend-player-title"
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <form className="suspension-dialog" ref={dialogRef} onSubmit={handleSubmit}>
        <h3 id="suspend-player-title" tabIndex={-1}>
          {t('admin.suspensions.suspendTitle', { name: player.name })}
        </h3>

        <PlayerHeader player={player} />

        <fieldset className="suspension-dialog-fieldset" disabled={saving}>
          <legend className="suspension-dialog-legend">{t('admin.suspensions.conditionLabel')}</legend>
          <label className="suspension-dialog-radio">
            <input
              type="radio"
              name="suspend-condition"
              value="date"
              checked={condition === 'date'}
              onChange={() => setCondition('date')}
            />
            {t('admin.suspensions.conditionDate')}
          </label>
          <label className="suspension-dialog-radio">
            <input
              type="radio"
              name="suspend-condition"
              value="shows"
              checked={condition === 'shows'}
              onChange={() => setCondition('shows')}
            />
            {t('admin.suspensions.conditionShows')}
          </label>
        </fieldset>

        {condition === 'date' ? (
          <div className="suspension-dialog-row">
            <label htmlFor="suspend-until">{t('admin.suspensions.dateLabel')}</label>
            <input
              id="suspend-until"
              type="date"
              min={minDate}
              value={until}
              required
              disabled={saving}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>
        ) : (
          <div className="suspension-dialog-row">
            <label htmlFor="suspend-shows">{t('admin.suspensions.showsLabel')}</label>
            <input
              id="suspend-shows"
              type="number"
              min={MIN_SHOWS}
              max={MAX_SHOWS}
              step={1}
              value={shows}
              required
              disabled={saving}
              onChange={(e) => setShows(e.target.value)}
            />
          </div>
        )}

        <div className="suspension-dialog-row">
          <label htmlFor="suspend-reason">{t('admin.suspensions.reasonLabel')}</label>
          <textarea
            id="suspend-reason"
            value={reason}
            disabled={saving}
            placeholder={t('admin.suspensions.reasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {errorMsg && <div className="suspension-dialog-error" role="alert">{errorMsg}</div>}

        <div className="suspension-dialog-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            {t('admin.suspensions.cancel')}
          </button>
          <button type="submit" className="suspension-dialog-danger" disabled={saving || !canSubmit}>
            {t('admin.suspensions.confirmSuspend')}
          </button>
        </div>
      </form>
    </div>
  );
}
