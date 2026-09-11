/**
 * Pure, IO-free helpers for player suspensions.
 *
 * A suspension ends either on a calendar date (`until`, YYYY-MM-DD) or after
 * a number of completed shows (`showsRequired`) dated after `suspendedAt`.
 * Exactly one of the two is set. Date comparisons follow the same convention
 * as `frontend/src/utils/bookingRecency.ts`: bare calendar days are anchored
 * at UTC noon so they never flip across timezones, and "today" is computed in
 * UTC so the list endpoint and the post-login modal agree.
 */
import type { LeagueEvent, Player, PlayerSuspension } from './repositories/types';

export interface SuspensionInput {
  until?: string;
  showsRequired?: number;
  reason?: string;
}

export interface SuspensionRow {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  divisionId?: string;
  suspension: PlayerSuspension;
  showsServed: number;
  /** Remaining shows for show-based suspensions; `null` for date-based ones. */
  showsRemaining: number | null;
  eligibleForReinstatement: boolean;
  eligibleReason: 'date' | 'shows' | null;
}

export const MIN_SHOWS_REQUIRED = 1;
export const MAX_SHOWS_REQUIRED = 52;
export const MAX_REASON_LENGTH = 500;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
  return CALENDAR_DATE.test(value);
}

/** True for a well-formed, real calendar day (rejects e.g. 2026-02-30). */
function isValidCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Epoch millis; bare calendar days anchor at UTC noon. NaN when unparseable. */
function toTime(value: string): number {
  return isCalendarDate(value) ? Date.parse(`${value}T12:00:00Z`) : Date.parse(value);
}

/** Today's calendar day in UTC as YYYY-MM-DD. */
export function todayIsoDateUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateSuspensionInput(
  body: unknown,
  todayIsoDate: string,
): { ok: true; value: SuspensionInput } | { ok: false; message: string } {
  if (!isRecord(body)) {
    return { ok: false, message: 'Request body must be an object' };
  }

  const { until, showsRequired, reason } = body;
  const hasUntil = until !== undefined && until !== null && until !== '';
  const hasShows = showsRequired !== undefined && showsRequired !== null && showsRequired !== '';

  if (hasUntil && hasShows) {
    return { ok: false, message: 'Provide either until or showsRequired, not both' };
  }
  if (!hasUntil && !hasShows) {
    return { ok: false, message: 'Provide either until (YYYY-MM-DD) or showsRequired' };
  }

  const value: SuspensionInput = {};

  if (hasUntil) {
    if (typeof until !== 'string' || !isValidCalendarDate(until)) {
      return { ok: false, message: 'until must be a valid date in YYYY-MM-DD format' };
    }
    if (until <= todayIsoDate) {
      return { ok: false, message: 'until must be a future date' };
    }
    value.until = until;
  }

  if (hasShows) {
    if (
      typeof showsRequired !== 'number' ||
      !Number.isInteger(showsRequired) ||
      showsRequired < MIN_SHOWS_REQUIRED ||
      showsRequired > MAX_SHOWS_REQUIRED
    ) {
      return {
        ok: false,
        message: `showsRequired must be an integer between ${MIN_SHOWS_REQUIRED} and ${MAX_SHOWS_REQUIRED}`,
      };
    }
    value.showsRequired = showsRequired;
  }

  if (reason !== undefined && reason !== null) {
    if (typeof reason !== 'string') {
      return { ok: false, message: 'reason must be a string' };
    }
    const trimmed = reason.trim();
    if (trimmed.length > MAX_REASON_LENGTH) {
      return { ok: false, message: `reason must be at most ${MAX_REASON_LENGTH} characters` };
    }
    if (trimmed.length > 0) {
      value.reason = trimmed;
    }
  }

  return { ok: true, value };
}

/** Completed events dated strictly after the suspension started. */
export function countShowsServed(events: LeagueEvent[], suspendedAt: string): number {
  const since = toTime(suspendedAt);
  if (Number.isNaN(since)) return 0;
  let served = 0;
  for (const event of events) {
    if (event.status !== 'completed') continue;
    const at = toTime(event.date);
    if (Number.isNaN(at)) continue;
    if (at > since) served += 1;
  }
  return served;
}

export function isSuspensionServed(
  suspension: PlayerSuspension,
  showsServed: number,
  todayIsoDate: string,
): { served: boolean; reason: 'date' | 'shows' | null } {
  if (suspension.until !== undefined && suspension.until <= todayIsoDate) {
    return { served: true, reason: 'date' };
  }
  if (suspension.showsRequired !== undefined && showsServed >= suspension.showsRequired) {
    return { served: true, reason: 'shows' };
  }
  return { served: false, reason: null };
}

/** Returns `null` when the player is not suspended. */
export function buildSuspensionRow(
  player: Player,
  events: LeagueEvent[],
  todayIsoDate: string,
): SuspensionRow | null {
  const suspension = player.suspension;
  if (!suspension) return null;

  const showsServed = countShowsServed(events, suspension.suspendedAt);
  const showsRemaining =
    suspension.showsRequired !== undefined
      ? Math.max(0, suspension.showsRequired - showsServed)
      : null;
  const { served, reason } = isSuspensionServed(suspension, showsServed, todayIsoDate);

  return {
    playerId: player.playerId,
    name: player.name,
    currentWrestler: player.currentWrestler,
    imageUrl: player.imageUrl,
    divisionId: player.divisionId,
    suspension,
    showsServed,
    showsRemaining,
    eligibleForReinstatement: served,
    eligibleReason: reason,
  };
}
