import type { TFunction } from 'i18next';
import type { PlayerSuspension } from '../../types';
import { formatShortDate } from '../../utils/bookingRecency';

/** Today's calendar day in UTC (YYYY-MM-DD), matching the server's eligibility check. */
export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Tomorrow's calendar day (YYYY-MM-DD) for the "until" date input minimum. */
export function tomorrowUtc(now = new Date()): string {
  const next = new Date(now.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  return todayUtc(next);
}

/** A date-based suspension is served once its end day is today or earlier. */
export function isDateSuspensionServed(suspension: PlayerSuspension, now = new Date()): boolean {
  return suspension.until != null && suspension.until <= todayUtc(now);
}

/** "Until Sep 30" / "3 shows" — what the admin chose when suspending. */
export function formatSuspensionCondition(suspension: PlayerSuspension, t: TFunction): string {
  if (suspension.until) {
    return t('admin.suspensions.untilDate', { date: formatShortDate(suspension.until) });
  }
  return t('admin.suspensions.forShows', { count: suspension.showsRequired ?? 0 });
}

/**
 * "2 / 4 shows" / "Until Sep 30" — how far along the suspension is. Show-based
 * progress needs the server-computed `showsServed`; pass null when unknown.
 */
export function formatSuspensionProgress(
  suspension: PlayerSuspension,
  showsServed: number | null,
  t: TFunction,
): string {
  if (suspension.until) {
    return t('admin.suspensions.untilDate', { date: formatShortDate(suspension.until) });
  }
  return t('admin.suspensions.showsProgress', {
    served: showsServed ?? 0,
    required: suspension.showsRequired ?? 0,
  });
}
