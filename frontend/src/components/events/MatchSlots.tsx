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
  /**
   * Called when an authenticated wrestler clicks Claim on an open slot. The
   * second arg carries the player's wrestler choice when MSL-03's chooser
   * was used; otherwise undefined and the backend defaults to 'main'.
   */
  onClaim: (
    slotId: string,
    options?: { wrestlerChoice?: 'main' | 'alternate' },
  ) => Promise<void>;
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
  /**
   * When true, disable the Claim button for every slot in this match
   * (MSL-04: one slot per event card). Release on the user's own slot is
   * unaffected — they need to be able to give up their existing claim.
   */
  claimDisabled?: boolean;
  /** Tooltip / hint shown on the disabled Claim button. */
  disableClaimReason?: string;
  /**
   * The signed-in player's main wrestler name. When BOTH this and
   * `currentPlayerAlternateWrestler` are set, clicking Claim opens the
   * MSL-03 chooser instead of submitting immediately.
   */
  currentPlayerCurrentWrestler?: string | null;
  /** The signed-in player's alternate wrestler name (if any). */
  currentPlayerAlternateWrestler?: string | null;
  /**
   * playerIds of the match's winners. When the match is completed, slot rows
   * for these players render with the winner highlight so the SPOTS list
   * matches the winner styling on the match-card header.
   */
  winnerPlayerIds?: string[];
  /** playerIds of the match's losers. Rendered with a subdued treatment. */
  loserPlayerIds?: string[];
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
    claimDisabled = false,
    disableClaimReason,
    currentPlayerCurrentWrestler,
    currentPlayerAlternateWrestler,
    winnerPlayerIds,
    loserPlayerIds,
  } = props;
  const { t } = useTranslation();
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  // MSL-03: when the player has both wrestlers, the Claim button opens this
  // chooser. The slotId being chosen for is what closes the modal.
  const [chooserSlotId, setChooserSlotId] = useState<string | null>(null);

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
    // MSL-03: open the chooser when the player has both a main and alt set.
    // No alternate → claim immediately and let the backend default to 'main'.
    if (currentPlayerCurrentWrestler && currentPlayerAlternateWrestler) {
      setChooserSlotId(slotId);
      return;
    }
    void runWithBusy(slotId, () => onClaim(slotId));
  };

  const handleChooserConfirm = (choice: 'main' | 'alternate') => {
    const slotId = chooserSlotId;
    if (!slotId) return;
    setChooserSlotId(null);
    void runWithBusy(slotId, () => onClaim(slotId, { wrestlerChoice: choice }));
  };

  const handleRelease = (slotId: string) => {
    void runWithBusy(slotId, () => onRelease(slotId));
  };

  if (loading) {
    const rows = loadingCount ?? Math.max(slots.length, 2);
    return (
      <div className="match-slots" data-match-id={matchId} role="status" aria-busy="true">
        <div className="match-slots-inner">
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
      </div>
    );
  }

  const isOpenSignups = matchStatus === 'open-signups';
  const headerLabel = isOpenSignups
    ? t('matches.slots.openSpotsHeader', { defaultValue: 'Open spots' })
    : t('matches.slots.spotsHeader', { defaultValue: 'Spots' });

  return (
    <div className="match-slots" data-match-id={matchId}>
      <div className="match-slots-inner">
        <div className="match-slots-header">
          <span className="match-slots-header-label">
            {isOpenSignups && <span className="match-slots-header-dot" aria-hidden="true" />}
            {headerLabel}
          </span>
          {isOpenSignups && (
            <span className="match-slots-badge" role="status">
              {t('matches.slots.openCountBadge', {
                open: openCount,
                total: sortedSlots.length,
                defaultValue: `${openCount} of ${sortedSlots.length} spots open`,
              })}
            </span>
          )}
        </div>

        <ol className="match-slots-list">
        {sortedSlots.map((slot) => {
          const filled = !!slot.playerId;
          const isMine = filled && slot.playerId === currentPlayerId;
          const busy = busySlotId === slot.slotId;
          const showClaim = !filled && !slot.lockedByAdmin && matchStatus === 'open-signups';
          const showRelease = isMine && !slot.lockedByAdmin
            && matchStatus !== 'completed' && matchStatus !== 'cancelled';

          const isWinner = filled
            && !!slot.playerId
            && !!winnerPlayerIds?.includes(slot.playerId);
          const isLoser = filled
            && !!slot.playerId
            && !isWinner
            && !!loserPlayerIds?.includes(slot.playerId);

          const rowClass = [
            'match-slot',
            filled ? 'filled' : 'open',
            isMine ? 'mine' : '',
            slot.lockedByAdmin ? 'locked' : '',
            isWinner ? 'winner' : '',
            isLoser ? 'loser' : '',
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
                    {isWinner && (
                      <span className="match-slot-winner-badge" aria-label="Winner">W</span>
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
                    disabled={busy || claimDisabled}
                    title={claimDisabled ? disableClaimReason : undefined}
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

      {/* MSL-03 wrestler chooser */}
      {chooserSlotId && currentPlayerCurrentWrestler && currentPlayerAlternateWrestler && (
        <WrestlerChooserDialog
          mainName={currentPlayerCurrentWrestler}
          alternateName={currentPlayerAlternateWrestler}
          onConfirm={handleChooserConfirm}
          onCancel={() => setChooserSlotId(null)}
        />
      )}
    </div>
  );
}

interface WrestlerChooserDialogProps {
  mainName: string;
  alternateName: string;
  onConfirm: (choice: 'main' | 'alternate') => void;
  onCancel: () => void;
}

function WrestlerChooserDialog({
  mainName,
  alternateName,
  onConfirm,
  onCancel,
}: WrestlerChooserDialogProps) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<'main' | 'alternate'>('main');

  return (
    <div
      className="wrestler-chooser-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="wrestler-chooser">
        <h3>{t('matches.slots.chooseWrestler', { defaultValue: 'Choose your wrestler' })}</h3>
        <label className="wrestler-chooser-option">
          <input
            type="radio"
            name="wrestler-chooser"
            value="main"
            checked={choice === 'main'}
            onChange={() => setChoice('main')}
          />
          <span>
            {t('matches.slots.useMain', { name: mainName, defaultValue: `Use main: ${mainName}` })}
          </span>
        </label>
        <label className="wrestler-chooser-option">
          <input
            type="radio"
            name="wrestler-chooser"
            value="alternate"
            checked={choice === 'alternate'}
            onChange={() => setChoice('alternate')}
          />
          <span>
            {t('matches.slots.useAlternate', {
              name: alternateName,
              defaultValue: `Use alternate: ${alternateName}`,
            })}
          </span>
        </label>
        <div className="wrestler-chooser-actions">
          <button type="button" className="wrestler-chooser-cancel" onClick={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            className="wrestler-chooser-confirm"
            onClick={() => onConfirm(choice)}
          >
            {t('matches.slots.confirmChoice', { defaultValue: 'Confirm' })}
          </button>
        </div>
      </div>
    </div>
  );
}
