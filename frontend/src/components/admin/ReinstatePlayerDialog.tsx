import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { playersApi } from '../../services/api';
import type { Player, PlayerSuspension, SuspensionRow } from '../../types';
import { formatShortDate } from '../../utils/bookingRecency';
import { PlayerHeader, type SuspensionDialogPlayer } from './SuspendPlayerDialog';
import {
  formatSuspensionCondition,
  formatSuspensionProgress,
  isDateSuspensionServed,
} from './suspensionFormat';
import './SuspensionDialogs.css';

export interface ReinstatePlayerDialogProps {
  player: SuspensionDialogPlayer;
  suspension: PlayerSuspension;
  /** Server-computed progress when the player came from the suspensions list. */
  row?: SuspensionRow;
  onSuccess: (updated: Player) => void;
  onClose: () => void;
}

export function EligibilityBadge({ eligible }: { eligible: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={`suspension-badge ${eligible ? 'suspension-badge--eligible' : 'suspension-badge--serving'}`}>
      {eligible ? t('admin.suspensions.eligible') : t('admin.suspensions.notEligible')}
    </span>
  );
}

export default function ReinstatePlayerDialog({
  player,
  suspension,
  row,
  onSuccess,
  onClose,
}: ReinstatePlayerDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('h3')?.focus();
  }, []);

  // Without a list row we only know date eligibility; show-based progress is server-side.
  const eligible = row ? row.eligibleForReinstatement : isDateSuspensionServed(suspension);
  const showsServed = row ? row.showsServed : null;

  const handleReinstate = async () => {
    if (saving) return;
    setErrorMsg(null);
    setSaving(true);
    try {
      const updated = await playersApi.reinstate(player.playerId);
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
      aria-labelledby="reinstate-player-title"
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="suspension-dialog" ref={dialogRef}>
        <h3 id="reinstate-player-title" tabIndex={-1}>
          {t('admin.suspensions.reinstateTitle', { name: player.name })}
        </h3>

        <PlayerHeader player={player} />

        <ul className="suspension-dialog-details">
          <li>
            <span className="suspension-dialog-detail-label">{t('admin.suspensions.colSince')}</span>
            <span>{t('admin.suspensions.suspendedSince', { date: formatShortDate(suspension.suspendedAt) })}</span>
          </li>
          <li>
            <span className="suspension-dialog-detail-label">{t('admin.suspensions.colCondition')}</span>
            <span>{formatSuspensionCondition(suspension, t)}</span>
          </li>
          <li>
            <span className="suspension-dialog-detail-label">{t('admin.suspensions.colProgress')}</span>
            <span>{formatSuspensionProgress(suspension, showsServed, t)}</span>
          </li>
          <li>
            <span className="suspension-dialog-detail-label">{t('admin.suspensions.colStatus')}</span>
            <EligibilityBadge eligible={eligible} />
          </li>
        </ul>

        {suspension.reason && (
          <p className="suspension-dialog-reason">
            {t('admin.suspensions.reason', { reason: suspension.reason })}
          </p>
        )}

        {errorMsg && <div className="suspension-dialog-error" role="alert">{errorMsg}</div>}

        <div className="suspension-dialog-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            {t('admin.suspensions.cancel')}
          </button>
          <button
            type="button"
            className="suspension-dialog-primary"
            onClick={handleReinstate}
            disabled={saving}
          >
            {eligible ? t('admin.suspensions.reinstateNow') : t('admin.suspensions.reinstateEarly')}
          </button>
        </div>
      </div>
    </div>
  );
}
