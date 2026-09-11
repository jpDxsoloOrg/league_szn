import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player, PlayerBookingInfo } from '../../types';
import {
  compareByBookingRecency,
  formatBookingTooltip,
  formatShortDate,
  isFreshBooking,
  isUpcomingBooking,
} from '../../utils/bookingRecency';
import {
  type CheckInStatus,
  CHECK_IN_STATUS_ORDER,
  isBookable,
} from '../../utils/checkInStatus';
import './PlayerBookingPicker.css';

/** @deprecated Use CheckInStatus from utils/checkInStatus. Kept for callers. */
export type PickerCheckInStatus = CheckInStatus;

export interface PlayerBookingPickerProps {
  id?: string;
  players: Player[];
  /**
   * 'single' fills one slot with one player. 'multi' toggles a set of
   * participants — the menu stays open and there is no "open spot" option.
   */
  mode?: 'single' | 'multi';
  /** Single mode: the selected player, or '' for an open spot. */
  value?: string;
  onChange?: (playerId: string) => void;
  /** Multi mode: the currently selected participants. */
  selectedPlayerIds?: ReadonlySet<string>;
  /** Multi mode: called with the player whose selection should flip. */
  onToggle?: (playerId: string) => void;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  /** Per-player check-in status for this event. Missing = 'noResponse'. */
  checkInStatusByPlayerId?: ReadonlyMap<string, CheckInStatus>;
  /** Players already booked elsewhere on this event's card. */
  bookedPlayerIds?: ReadonlySet<string>;
  /**
   * Per-player last-booked date and streak (staff only). Sorts the most
   * recently booked to the bottom of each group and shows a meta column.
   */
  bookingInfoByPlayerId?: ReadonlyMap<string, PlayerBookingInfo>;
  disabled?: boolean;
}

interface PickerGroup {
  status: CheckInStatus;
  players: Player[];
}

export default function PlayerBookingPicker({
  id,
  players,
  mode = 'single',
  value = '',
  onChange,
  selectedPlayerIds,
  onToggle,
  placeholder,
  checkInStatusByPlayerId,
  bookedPlayerIds,
  bookingInfoByPlayerId,
  disabled = false,
}: PlayerBookingPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const statusOf = useMemo(
    () => (playerId: string): CheckInStatus =>
      checkInStatusByPlayerId?.get(playerId) ?? 'noResponse',
    [checkInStatusByPlayerId],
  );

  const multi = mode === 'multi';

  const isSelected = useCallback(
    (playerId: string) =>
      multi ? (selectedPlayerIds?.has(playerId) ?? false) : playerId === value,
    [multi, selectedPlayerIds, value],
  );

  const selectedPlayer = !multi && value
    ? players.find((p) => p.playerId === value)
    : undefined;

  const selectedCount = multi ? (selectedPlayerIds?.size ?? 0) : 0;

  // When no check-in data has loaded, filtering to available/tentative would
  // empty the list, so fall back to showing everyone.
  const hasCheckInData = (checkInStatusByPlayerId?.size ?? 0) > 0;

  const groups = useMemo<PickerGroup[]>(() => {
    const term = search.trim().toLowerCase();
    const buckets = new Map<CheckInStatus, Player[]>();

    for (const player of players) {
      const status = statusOf(player.playerId);
      // The already-selected player stays visible regardless of filters, so
      // an admin can always see and clear what is currently booked.
      const selected = isSelected(player.playerId);
      if (
        hasCheckInData &&
        !showAll &&
        !selected &&
        !isBookable(status)
      ) {
        continue;
      }
      if (term) {
        const haystack = `${player.name} ${player.currentWrestler ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) continue;
      }
      const list = buckets.get(status);
      if (list) list.push(player);
      else buckets.set(status, [player]);
    }

    const ordered: PickerGroup[] = [];
    for (const status of CHECK_IN_STATUS_ORDER) {
      const bucket = buckets.get(status);
      if (bucket && bucket.length > 0) {
        bucket.sort((a, b) => compareByBookingRecency(a, b, bookingInfoByPlayerId));
        ordered.push({ status, players: bucket });
      }
    }
    return ordered;
  }, [players, search, showAll, statusOf, isSelected, hasCheckInData, bookingInfoByPlayerId]);

  const renderBookingMeta = (playerId: string) => {
    const info = bookingInfoByPlayerId?.get(playerId);
    if (!info) return null;
    const streak = info.currentStreak;
    return (
      <span className="booking-picker-meta">
        {streak.count >= 2 && (
          <span
            className={`booking-picker-streak booking-picker-streak--${streak.type}`}
            title={t('events.booking.streakTitle', {
              count: streak.count,
              type: t(`events.booking.streakType.${streak.type}`),
              defaultValue: `On a ${streak.count}-match ${streak.type} streak`,
            })}
          >
            {streak.type}
            {streak.count}
          </span>
        )}
        {info.lastBookedAt ? (
          <span className="booking-picker-last" title={formatBookingTooltip(info.lastBookedAt)}>
            {isUpcomingBooking(info.lastBookedAt)
              ? t('events.booking.bookedUpcoming', {
                  when: formatShortDate(info.lastBookedAt),
                  defaultValue: `Booked ${formatShortDate(info.lastBookedAt)}`,
                })
              : t('events.booking.lastBooked', {
                  when: formatShortDate(info.lastBookedAt),
                  defaultValue: `Last booked ${formatShortDate(info.lastBookedAt)}`,
                })}
          </span>
        ) : (
          <span className="booking-picker-last booking-picker-last--never">
            {t('events.booking.neverBooked', { defaultValue: 'Never booked' })}
          </span>
        )}
      </span>
    );
  };

  const hiddenCount = useMemo(() => {
    if (!hasCheckInData || showAll) return 0;
    return players.filter(
      (p) => !isSelected(p.playerId) && !isBookable(statusOf(p.playerId)),
    ).length;
  }, [players, showAll, statusOf, isSelected, hasCheckInData]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      setSearch('');
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    // Multi mode has no confirm button — the menu stays open across picks —
    // so Escape is the way out without reaching for the mouse.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (playerId: string) => {
    if (multi) {
      // Booking several people in a row is the normal case, so the menu
      // stays open and the search term survives the click.
      onToggle?.(playerId);
      return;
    }
    onChange?.(playerId);
    setOpen(false);
    setSearch('');
  };

  const openLabel = t('matches.slots.openOption', { defaultValue: '— Open spot —' });

  const statusLabel = (status: CheckInStatus) =>
    t(`events.checkIn.roster.${status}`, {
      defaultValue:
        status === 'noResponse'
          ? 'No Response'
          : status.charAt(0).toUpperCase() + status.slice(1),
    });

  return (
    <div className="booking-picker" ref={containerRef}>
      <button
        type="button"
        id={id}
        className="booking-picker-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {multi ? (
          <span
            className={`booking-picker-trigger-text${selectedCount === 0 ? ' booking-picker-trigger-text--empty' : ''}`}
          >
            {selectedCount === 0
              ? (placeholder ??
                t('matches.slots.picker.addParticipants', {
                  defaultValue: 'Add participants…',
                }))
              : t('matches.slots.picker.selectedCount', {
                  count: selectedCount,
                  defaultValue: `${selectedCount} selected`,
                })}
          </span>
        ) : selectedPlayer ? (
          <span className="booking-picker-trigger-text">
            <span
              className={`booking-picker-dot booking-picker-dot--${statusOf(selectedPlayer.playerId)}`}
              aria-hidden="true"
            />
            {selectedPlayer.currentWrestler} ({selectedPlayer.name})
          </span>
        ) : (
          <span className="booking-picker-trigger-text booking-picker-trigger-text--empty">
            {placeholder ?? openLabel}
          </span>
        )}
        <span className="booking-picker-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="booking-picker-menu" role="listbox">
          <input
            type="search"
            className="booking-picker-search"
            value={search}
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('matches.slots.picker.search', {
              defaultValue: 'Search name or wrestler…',
            })}
            aria-label={t('matches.slots.picker.search', {
              defaultValue: 'Search name or wrestler…',
            })}
          />

          {!multi && (
            <button
              type="button"
              className="booking-picker-option booking-picker-option--open"
              role="option"
              aria-selected={value === ''}
              onClick={() => handleSelect('')}
            >
              {openLabel}
            </button>
          )}

          {groups.length === 0 && (
            <p className="booking-picker-empty">
              {t('matches.slots.picker.noMatches', {
                defaultValue: 'No players match.',
              })}
            </p>
          )}

          {groups.map((group) => (
            <div key={group.status} className="booking-picker-group">
              <div
                className={`booking-picker-group-title booking-picker-group-title--${group.status}`}
              >
                {statusLabel(group.status)} ({group.players.length})
              </div>
              {group.players.map((player) => {
                const isBooked = bookedPlayerIds?.has(player.playerId) ?? false;
                const info = bookingInfoByPlayerId?.get(player.playerId);
                const fresh = info !== undefined && isFreshBooking(info.lastBookedAt);
                return (
                  <button
                    key={player.playerId}
                    type="button"
                    className={`booking-picker-option booking-picker-option--${group.status}${
                      isBooked ? ' booking-picker-option--booked' : ''
                    }${fresh ? ' booking-picker-option--fresh' : ''}`}
                    role="option"
                    aria-selected={isSelected(player.playerId)}
                    onClick={() => handleSelect(player.playerId)}
                  >
                    <span
                      className={`booking-picker-dot booking-picker-dot--${group.status}`}
                      aria-hidden="true"
                    />
                    <span className="booking-picker-option-text">
                      {player.currentWrestler} ({player.name})
                    </span>
                    {multi && isSelected(player.playerId) && (
                      <span className="booking-picker-check" aria-hidden="true">✓</span>
                    )}
                    {isBooked && (
                      <span className="booking-picker-booked-badge">
                        {t('matches.slots.picker.alreadyBooked', {
                          defaultValue: 'On card',
                        })}
                      </span>
                    )}
                    {renderBookingMeta(player.playerId)}
                  </button>
                );
              })}
            </div>
          ))}

          {hiddenCount > 0 && !showAll && (
            <button
              type="button"
              className="booking-picker-show-all"
              onClick={() => setShowAll(true)}
            >
              {t('matches.slots.picker.showAll', {
                count: hiddenCount,
                defaultValue: `Show ${hiddenCount} who didn't check in available`,
              })}
            </button>
          )}
          {showAll && hasCheckInData && (
            <button
              type="button"
              className="booking-picker-show-all"
              onClick={() => setShowAll(false)}
            >
              {t('matches.slots.picker.showBookableOnly', {
                defaultValue: 'Show available & tentative only',
              })}
            </button>
          )}

          {multi && (
            // Multi mode has no implicit close (the menu deliberately survives
            // each pick), and click-outside/Escape are both invisible, so it
            // needs a button people can actually see.
            <button
              type="button"
              className="booking-picker-done"
              onClick={() => {
                setOpen(false);
                setSearch('');
              }}
            >
              {t('matches.slots.picker.done', { defaultValue: 'Done' })}
              {selectedCount > 0 && ` (${selectedCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
