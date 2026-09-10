import type { Player, PlayerBookingInfo } from '../types';
import { formatCalendarDate, formatDateTime, toCalendarDate } from './dateUtils';

/** Booked this long ago (or never) counts as "fresh" — worth surfacing. */
export const FRESH_AFTER_DAYS = 14;

/**
 * Sort order inside a check-in bucket: never booked first, then oldest
 * booking first, most recent last; name breaks ties. Without booking info
 * it degrades to the old name-only order.
 */
export function compareByBookingRecency(
  a: Player,
  b: Player,
  info?: ReadonlyMap<string, PlayerBookingInfo>,
): number {
  if (info) {
    const aAt = info.get(a.playerId)?.lastBookedAt ?? null;
    const bAt = info.get(b.playerId)?.lastBookedAt ?? null;
    if (aAt === null && bAt !== null) return -1;
    if (aAt !== null && bAt === null) return 1;
    if (aAt !== null && bAt !== null && aAt !== bAt) return aAt < bAt ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Match dates are either a calendar day (event-linked) or a full timestamp. */
function isCalendarDate(value: string): boolean {
  return CALENDAR_DATE.test(value);
}

function toTime(value: string): number {
  // A bare calendar day is anchored to UTC noon so "today" never flips to
  // yesterday/tomorrow in viewer timezones.
  return isCalendarDate(value) ? Date.parse(`${value}T12:00:00Z`) : Date.parse(value);
}

export function isFreshBooking(lastBookedAt: string | null | undefined, now = new Date()): boolean {
  if (!lastBookedAt) return true;
  const then = toTime(lastBookedAt);
  if (Number.isNaN(then)) return false;
  return now.getTime() - then >= FRESH_AFTER_DAYS * 86400000;
}

/** True when the booking is still ahead of us (a scheduled card). */
export function isUpcomingBooking(lastBookedAt: string, now = new Date()): boolean {
  const then = toTime(lastBookedAt);
  return !Number.isNaN(then) && then > now.getTime();
}

/**
 * "Aug 29" / "Aug 29, 2025" when it's a different year. Calendar-day
 * values render as that day everywhere; timestamps use local time.
 */
export function formatShortDate(value: string, now = new Date()): string {
  const day = isCalendarDate(value) ? value : null;
  const d = day ? new Date(`${day}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const year = day ? Number(day.slice(0, 4)) : d.getFullYear();
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(year === now.getFullYear() ? {} : { year: 'numeric' }),
  };
  return day ? formatCalendarDate(day, undefined, options) : d.toLocaleDateString(undefined, options);
}

/** Tooltip text: the calendar day for date-only values, else the full local timestamp. */
export function formatBookingTooltip(value: string): string {
  return isCalendarDate(value) ? formatCalendarDate(toCalendarDate(value)) : formatDateTime(value);
}
