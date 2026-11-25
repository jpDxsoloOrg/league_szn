/**
 * Shared pieces of the GM injury routes (INJ-08).
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAuthContext } from '../../lib/auth';
import { createNotification, type NotificationType } from '../../lib/notifications';
import { returnDate } from '../../lib/policies/fatigue';
import { getRepositories } from '../../lib/repositories';
import type { Player } from '../../lib/repositories/types';
import { forbidden } from '../../lib/response';

export const INJURY_NOTE_MAX_LENGTH = 500;
/** Longest injury a GM can put on or extend to, in weeks. */
export const INJURY_MAX_WEEKS = 52;
export const INJURIES_OFF_MESSAGE = 'Injuries are turned off';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The `injuries` feature flag (INJ-01, off by default). */
export async function injuriesEnabled(): Promise<boolean> {
  return (await getRepositories().user.siteConfig.getFeatures()).injuries === true;
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
 * When an injury of `weeks` weeks that started at `startedAt` ends, as an ISO
 * string: INJ-02's `returnDate` (the first league week boundary at or after
 * `weeks` full weeks) in the league time zone.
 */
export function injuryReturnsAt(startedAt: string, weeks: number, timeZone: string): string {
  return returnDate(startedAt, weeks, timeZone).toISOString();
}

/** Whole weeks from `startedAt` to `returnsAt`, rounded up (at least 1). */
export function weeksBetween(startedAt: string, returnsAt: string): number {
  return Math.max(1, Math.ceil((Date.parse(returnsAt) - Date.parse(startedAt)) / WEEK_MS));
}

/** `YYYY-MM-DD` in league time, for notification copy. */
export function formatLeagueDate(iso: string, timeZone: string): string {
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
