/**
 * Shared pieces of the GM injury routes (INJ-08).
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAuthContext } from '../../lib/auth';
import { leagueWeekOf, DEFAULT_LEAGUE_TIME_ZONE } from '../../lib/leagueWeek';
import { createNotification, type NotificationType } from '../../lib/notifications';
import { getRepositories } from '../../lib/repositories';
import type { FeatureFlags } from '../../lib/repositories/SiteConfigRepository';
import type { Player } from '../../lib/repositories/types';
import { forbidden } from '../../lib/response';

export const INJURY_NOTE_MAX_LENGTH = 500;
/** Longest injury a GM can put on or extend to, in weeks. */
export const INJURY_MAX_WEEKS = 52;
/**
 * Highest stamina a GM can set. Matches the INJ-01 `maxStamina` default; read
 * the tunable instead once INJ-01's site config is on this branch.
 */
export const GM_MAX_STAMINA = 100;

export const INJURIES_OFF_MESSAGE = 'Injuries are turned off';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The `injuries` feature flag (INJ-01). Read loosely so this file builds
 * whether or not INJ-01's `FeatureFlags.injuries` is merged yet; a missing
 * flag counts as off.
 */
export async function injuriesEnabled(): Promise<boolean> {
  const features: FeatureFlags & { injuries?: boolean } = await getRepositories().user.siteConfig.getFeatures();
  return features.injuries === true;
}

/** 403 while the injuries feature is off, else null. */
export async function requireInjuriesEnabled(): Promise<APIGatewayProxyResult | null> {
  return (await injuriesEnabled()) ? null : forbidden(INJURIES_OFF_MESSAGE);
}

/** The caller's Cognito sub, for `changes[].by` and `createdBy`. */
export const callerId = (event: APIGatewayProxyEvent): string => getAuthContext(event).sub || 'unknown';

/** Optional GM note: trimmed, at most INJURY_NOTE_MAX_LENGTH characters. */
export function parseNote(value: unknown): { note?: string; error?: string } {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'string') return { error: 'note must be a string' };
  const note = value.trim();
  if (note.length > INJURY_NOTE_MAX_LENGTH) {
    return { error: `note must be at most ${INJURY_NOTE_MAX_LENGTH} characters` };
  }
  return note === '' ? {} : { note };
}

export function isValidWeeks(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= INJURY_MAX_WEEKS;
}

/**
 * When an injury of `weeks` weeks that started at `startedAt` ends: the first
 * league week boundary (Sunday 00:00 league time) at or after `weeks` full
 * weeks. Same rule as INJ-02's `returnDate`; switch to it once that lands.
 */
export function injuryReturnDate(startedAt: string, weeks: number, timeZone: string = DEFAULT_LEAGUE_TIME_ZONE): string {
  const started = new Date(startedAt);
  const weekStart = leagueWeekOf(started, timeZone).weekStart;
  const weeksAhead = started.getTime() === weekStart.getTime() ? weeks : weeks + 1;
  // Land mid-week, then snap to that week's start: robust to DST hours.
  const insideTargetWeek = new Date(weekStart.getTime() + weeksAhead * WEEK_MS + DAY_MS / 2);
  return leagueWeekOf(insideTargetWeek, timeZone).weekStart.toISOString();
}

/** Whole weeks from `startedAt` to `returnsAt`, rounded up (at least 1). */
export function weeksBetween(startedAt: string, returnsAt: string): number {
  return Math.max(1, Math.ceil((Date.parse(returnsAt) - Date.parse(startedAt)) / WEEK_MS));
}

/** `YYYY-MM-DD` in league time, for notification copy. */
export function formatLeagueDate(iso: string, timeZone: string = DEFAULT_LEAGUE_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso));
}

/**
 * Tells the player about a GM change (best effort: createNotification never
 * throws). Players without a linked account get nothing.
 */
export async function notifyPlayer(
  player: Pick<Player, 'playerId' | 'userId'>,
  type: NotificationType,
  message: string,
): Promise<void> {
  if (!player.userId) return;
  await createNotification({
    userId: player.userId,
    type,
    message,
    sourceId: player.playerId,
    sourceType: 'injury',
  });
}

export const SAVE_CONFLICT_MESSAGE = "The player's condition changed while saving. Reload and try again.";
