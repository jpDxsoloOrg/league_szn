import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '../../types';
import './PlayerBookingPicker.css';

/**
 * Check-in standing for one player on the event being booked. Mirrors the
 * roster buckets returned by GET /events/{eventId}/check-ins, plus the
 * 'noResponse' bucket for players who never answered.
 */
export type PickerCheckInStatus =
  | 'available'
  | 'tentative'
  | 'unavailable'
  | 'noResponse';

/** Buckets shown by default — the people who actually said they can wrestle. */
const BOOKABLE: PickerCheckInStatus[] = ['available', 'tentative'];

/** Render order for the grouped list. */
const GROUP_ORDER: PickerCheckInStatus[] = [
  'available',
  'tentative',
  'noResponse',
  'unavailable',
];

export interface PlayerBookingPickerProps {
  id?: string;
  players: Player[];
  /** Currently selected player, or '' for an open spot. */
  value: string;
  onChange: (playerId: string) => void;
  /** Per-player check-in status for this event. Missing = 'noResponse'. */
  checkInStatusByPlayerId?: ReadonlyMap<string, PickerCheckInStatus>;
  /** Players already booked elsewhere on this event's card. */
  bookedPlayerIds?: ReadonlySet<string>;
  disabled?: boolean;
}

interface PickerGroup {
  status: PickerCheckInStatus;
  players: Player[];
}

export default function PlayerBookingPicker({
  id,
  players,
  value,
  onChange,
  checkInStatusByPlayerId,
  bookedPlayerIds,
  disabled = false,
}: PlayerBookingPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const statusOf = useMemo(
    () => (playerId: string): PickerCheckInStatus =>
      checkInStatusByPlayerId?.get(playerId) ?? 'noResponse',
    [checkInStatusByPlayerId],
  );

  const selectedPlayer = value
    ? players.find((p) => p.playerId === value)
    : undefined;

  // When no check-in data has loaded, filtering to available/tentative would
  // empty the list, so fall back to showing everyone.
  const hasCheckInData = (checkInStatusByPlayerId?.size ?? 0) > 0;

  const groups = useMemo<PickerGroup[]>(() => {
    const term = search.trim().toLowerCase();
    const buckets = new Map<PickerCheckInStatus, Player[]>();

    for (const player of players) {
      const status = statusOf(player.playerId);
      // The already-selected player stays visible regardless of filters, so
      // an admin can always see and clear what is currently booked.
      const isSelected = player.playerId === value;
      if (
        hasCheckInData &&
        !showAll &&
        !isSelected &&
        !BOOKABLE.includes(status)
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
    for (const status of GROUP_ORDER) {
      const bucket = buckets.get(status);
      if (bucket && bucket.length > 0) {
        bucket.sort((a, b) => a.name.localeCompare(b.name));
        ordered.push({ status, players: bucket });
      }
    }
    return ordered;
  }, [players, search, showAll, statusOf, value, hasCheckInData]);

  const hiddenCount = useMemo(() => {
    if (!hasCheckInData || showAll) return 0;
    return players.filter(
      (p) => p.playerId !== value && !BOOKABLE.includes(statusOf(p.playerId)),
    ).length;
  }, [players, showAll, statusOf, value, hasCheckInData]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (playerId: string) => {
    onChange(playerId);
    setOpen(false);
    setSearch('');
  };

  const openLabel = t('matches.slots.openOption', { defaultValue: '— Open spot —' });

  const statusLabel = (status: PickerCheckInStatus) =>
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
        {selectedPlayer ? (
          <span className="booking-picker-trigger-text">
            <span
              className={`booking-picker-dot booking-picker-dot--${statusOf(selectedPlayer.playerId)}`}
              aria-hidden="true"
            />
            {selectedPlayer.currentWrestler} ({selectedPlayer.name})
          </span>
        ) : (
          <span className="booking-picker-trigger-text booking-picker-trigger-text--empty">
            {openLabel}
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

          <button
            type="button"
            className="booking-picker-option booking-picker-option--open"
            role="option"
            aria-selected={value === ''}
            onClick={() => handleSelect('')}
          >
            {openLabel}
          </button>

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
                return (
                  <button
                    key={player.playerId}
                    type="button"
                    className={`booking-picker-option booking-picker-option--${group.status}${
                      isBooked ? ' booking-picker-option--booked' : ''
                    }`}
                    role="option"
                    aria-selected={player.playerId === value}
                    onClick={() => handleSelect(player.playerId)}
                  >
                    <span
                      className={`booking-picker-dot booking-picker-dot--${group.status}`}
                      aria-hidden="true"
                    />
                    <span className="booking-picker-option-text">
                      {player.currentWrestler} ({player.name})
                    </span>
                    {isBooked && (
                      <span className="booking-picker-booked-badge">
                        {t('matches.slots.picker.alreadyBooked', {
                          defaultValue: 'On card',
                        })}
                      </span>
                    )}
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
        </div>
      )}
    </div>
  );
}
