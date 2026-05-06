import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HydratedMatchSlot, MatchStatus } from '../../types';
import './MatchSlots.css';

export interface MatchSlotsProps {
  matchId: string;
  slots: HydratedMatchSlot[];
  matchStatus: MatchStatus;
  /** The viewing user's playerId, if they have a linked player profile. */
  currentPlayerId?: string;
  /** True for Admin or Moderator. Unlocks the per-slot edit affordance. */
  isAdmin?: boolean;
  /** True when a JWT is available. False = guest; clicking Claim triggers `onLoginRequired`. */
  isAuthenticated?: boolean;
  /** Called when an authenticated wrestler clicks Claim on an open slot. */
  onClaim: (slotId: string) => Promise<void>;
  /** Called when the slot's current claimant clicks Release, or admin releases. */
  onRelease: (slotId: string) => Promise<void>;
  /** Optional admin hook — opens whatever slot-edit dialog the parent provides. */
  onAdminEdit?: (slot: HydratedMatchSlot) => void;
  /** Called when a guest tries to Claim. Parent typically routes to /login. */
  onLoginRequired?: () => void;
  /** When true, renders skeleton rows instead of slot data. */
  loading?: boolean;
  /** Number of skeleton rows when loading. Defaults to slots.length or 2. */
  loadingCount?: number;
}

/**
 * Renders a match's slots in position order with claim / release / admin
 * controls. Pure presentational — the parent owns slot data and is
 * responsible for refetching on error (per MSL-02 spec).
 */
export default function MatchSlots(props: MatchSlotsProps) {
  const {
    matchId,
    slots,
    matchStatus,
    currentPlayerId,
    isAdmin = false,
    isAuthenticated = false,
    onClaim,
    onRelease,
    onAdminEdit,
    onLoginRequired,
    loading = false,
    loadingCount,
  } = props;
  const { t } = useTranslation();
  const [busySlotId, setBusySlotId] = useState<string | null>(null);

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.position - b.position),
    [slots],
  );
  const openCount = useMemo(
    () => sortedSlots.filter((s) => !s.playerId).length,
    [sortedSlots],
  );

  const runWithBusy = async (slotId: string, fn: () => Promise<void>) => {
    setBusySlotId(slotId);
    try {
      await fn();
    } finally {
      setBusySlotId(null);
    }
  };

  const handleClaim = (slotId: string) => {
    if (!isAuthenticated) {
      onLoginRequired?.();
      return;
    }
    void runWithBusy(slotId, () => onClaim(slotId));
  };

  const handleRelease = (slotId: string) => {
    void runWithBusy(slotId, () => onRelease(slotId));
  };

  if (loading) {
    const rows = loadingCount ?? Math.max(slots.length, 2);
    return (
      <div className="match-slots" data-match-id={matchId} role="status" aria-busy="true">
        <ol className="match-slots-list">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className="match-slot match-slot-skeleton">
              <span className="match-slot-position">·</span>
              <span className="match-slot-content">
                <span className="match-slot-skeleton-bar" />
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="match-slots" data-match-id={matchId}>
      {matchStatus === 'open-signups' && (
        <div className="match-slots-badge" role="status">
          {t('matches.slots.openCountBadge', {
            open: openCount,
            total: sortedSlots.length,
            defaultValue: `${openCount} of ${sortedSlots.length} spots open`,
          })}
        </div>
      )}

      <ol className="match-slots-list">
        {sortedSlots.map((slot) => {
          const filled = !!slot.playerId;
          const isMine = filled && slot.playerId === currentPlayerId;
          const busy = busySlotId === slot.slotId;
          const showClaim = !filled && !slot.lockedByAdmin && matchStatus === 'open-signups';
          const showRelease = isMine && !slot.lockedByAdmin
            && matchStatus !== 'completed' && matchStatus !== 'cancelled';

          const rowClass = [
            'match-slot',
            filled ? 'filled' : 'open',
            isMine ? 'mine' : '',
            slot.lockedByAdmin ? 'locked' : '',
          ].filter(Boolean).join(' ');

          return (
            <li key={slot.slotId} className={rowClass} data-slot-id={slot.slotId}>
              <span className="match-slot-position" aria-label={`Position ${slot.position}`}>
                {slot.position}
              </span>

              {slot.teamLabel && (
                <span className="match-slot-team-label">{slot.teamLabel}</span>
              )}

              <span className="match-slot-content">
                {filled && slot.playerId ? (
                  <Link to={`/players/${slot.playerId}`} className="match-slot-link">
                    <span className="match-slot-wrestler">{slot.wrestlerName ?? slot.playerId}</span>
                    {slot.playerName && (
                      <span className="match-slot-player"> ({slot.playerName})</span>
                    )}
                  </Link>
                ) : (
                  <span className="match-slot-empty">
                    {slot.lockedByAdmin
                      ? t('matches.slots.locked', { defaultValue: 'Locked' })
                      : t('matches.slots.open', { defaultValue: 'Open spot' })}
                  </span>
                )}
              </span>

              {slot.lockedByAdmin && (
                <span
                  className="match-slot-lock-icon"
                  title={t('matches.slots.locked', { defaultValue: 'Locked' })}
                  aria-hidden="true"
                >
                  🔒
                </span>
              )}

              <span className="match-slot-actions">
                {showClaim && (
                  <button
                    type="button"
                    className="match-slot-btn match-slot-claim"
                    disabled={busy}
                    onClick={() => handleClaim(slot.slotId)}
                  >
                    {busy
                      ? t('matches.slots.claiming', { defaultValue: 'Claiming…' })
                      : t('matches.slots.claim', { defaultValue: 'Claim spot' })}
                  </button>
                )}
                {showRelease && (
                  <button
                    type="button"
                    className="match-slot-btn match-slot-release"
                    disabled={busy}
                    onClick={() => handleRelease(slot.slotId)}
                  >
                    {busy
                      ? t('matches.slots.releasing', { defaultValue: 'Releasing…' })
                      : t('matches.slots.release', { defaultValue: 'Release' })}
                  </button>
                )}
                {isAdmin && onAdminEdit && (
                  <button
                    type="button"
                    className="match-slot-btn match-slot-admin-edit"
                    onClick={() => onAdminEdit(slot)}
                  >
                    {t('matches.slots.adminEdit', { defaultValue: 'Edit' })}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
