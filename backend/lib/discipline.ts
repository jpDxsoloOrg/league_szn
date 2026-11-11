import type { APIGatewayProxyResult } from 'aws-lambda';
import type { PlayerStrike } from './repositories/types';
import { refused } from './response';

/**
 * The strike rules, as pure functions of a Player row and a clock. Nothing here
 * touches AWS or a repository, and no window is stored: a block cannot outlive
 * its date because it is recomputed on every read. The one stored flag is
 * `deactivatedAt`, since deactivation ends only by admin action.
 */

export const WARNING_DAYS = 7;
export const COOLDOWN_DAYS = 14;
export const SIGNUP_BLOCK_DAYS = 7;
/**
 * Days after T2 from which another strike deactivates. 0 is anywhere in the 14
 * days (owner decision 2), so a third strike always deactivates. Above 0 it could
 * restart the block instead, which has no wording of its own in the modal or the
 * notification.
 */
export const DEACTIVATION_WINDOW_START_DAYS = 0;
export const MIN_REASON_LENGTH = 3;
export const MAX_REASON_LENGTH = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

export type DisciplineStatus = 'clear' | 'warned' | 'signup-blocked' | 'cooldown' | 'deactivated';
export type StrikeOutcome = 'warned' | 'signup-blocked' | 'deactivated';

export interface DisciplineFields {
  strikes?: PlayerStrike[];
  deactivatedAt?: string;
}

/** What the player and staff read. Issuer identity is left out on purpose. */
export interface ActiveStrikeView {
  strikeId: string;
  issuedAt: string;
  reason: string;
}

export interface PlayerDisciplineSummary {
  status: DisciplineStatus;
  /** 3 for a deactivated player. Can pass 3 only if the window start is raised above 0. */
  activeStrikeCount: number;
  /** Oldest first. */
  activeStrikes: ActiveStrikeView[];
  cooldownEndsAt: string | null;
  /** Non-null only while status is 'signup-blocked'. */
  signupBlockedUntil: string | null;
  deactivatedAt: string | null;
}

const toIso = (epochMs: number): string => new Date(epochMs).toISOString();

export function computeDiscipline(player: DisciplineFields, now: Date = new Date()): PlayerDisciplineSummary {
  const strikes = (player.strikes ?? [])
    .filter((strike) => !strike.clearedAt)
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));

  let run: PlayerStrike[] = [];
  let cooldownEnd = 0;
  for (const strike of strikes) {
    const issued = Date.parse(strike.issuedAt);
    if (issued >= cooldownEnd) run = [];
    run.push(strike);
    cooldownEnd = issued + (run.length === 1 ? WARNING_DAYS : COOLDOWN_DAYS) * DAY_MS;
  }
  // A deactivated player's strikes stay active until reactivation, however long that takes.
  if (!player.deactivatedAt && now.getTime() >= cooldownEnd) run = [];

  const activeStrikes: ActiveStrikeView[] = run.map(({ strikeId, issuedAt, reason }) => ({ strikeId, issuedAt, reason }));
  const base = { activeStrikeCount: run.length, activeStrikes };

  if (player.deactivatedAt) {
    return {
      ...base,
      status: 'deactivated',
      cooldownEndsAt: null,
      signupBlockedUntil: null,
      deactivatedAt: player.deactivatedAt,
    };
  }
  if (run.length === 0) {
    return { ...base, status: 'clear', cooldownEndsAt: null, signupBlockedUntil: null, deactivatedAt: null };
  }
  if (run.length === 1) {
    return { ...base, status: 'warned', cooldownEndsAt: toIso(cooldownEnd), signupBlockedUntil: null, deactivatedAt: null };
  }

  const blockEnd = Date.parse(run[run.length - 1].issuedAt) + SIGNUP_BLOCK_DAYS * DAY_MS;
  const blocked = now.getTime() < blockEnd;
  return {
    ...base,
    status: blocked ? 'signup-blocked' : 'cooldown',
    cooldownEndsAt: toIso(cooldownEnd),
    signupBlockedUntil: blocked ? toIso(blockEnd) : null,
    deactivatedAt: null,
  };
}

export function isDeactivated(player: { deactivatedAt?: string }): boolean {
  return Boolean(player.deactivatedAt);
}

/** True for a deactivated player too. */
export function isSignupBlocked(player: DisciplineFields, now: Date = new Date()): boolean {
  if (isDeactivated(player)) return true;
  return computeDiscipline(player, now).status === 'signup-blocked';
}

export function validateReason(raw: unknown): { reason: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'A reason is required' };
  const reason = raw.trim();
  if (reason.length < MIN_REASON_LENGTH) {
    return { error: `Reason must be at least ${MIN_REASON_LENGTH} characters` };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return { error: `Reason must be at most ${MAX_REASON_LENGTH} characters` };
  }
  return { reason };
}

/** What one more strike would do now. The only place that decides deactivation. */
export function nextStrikeOutcome(
  player: DisciplineFields,
  now: Date = new Date(),
  windowStartDays: number = DEACTIVATION_WINDOW_START_DAYS,
): StrikeOutcome {
  const { activeStrikes } = computeDiscipline(player, now);
  if (activeStrikes.length === 0) return 'warned';
  if (activeStrikes.length === 1) return 'signup-blocked';
  const lastIssued = Date.parse(activeStrikes[activeStrikes.length - 1].issuedAt);
  return now.getTime() >= lastIssued + windowStartDays * DAY_MS ? 'deactivated' : 'signup-blocked';
}

/** Lowercase, drop any +tag, drop dots for gmail.com and googlemail.com. */
export function toSignupGuardKey(email: string): string {
  const lowered = email.trim().toLowerCase();
  const atIndex = lowered.lastIndexOf('@');
  if (atIndex < 0) return lowered;
  const domain = lowered.slice(atIndex + 1);
  let local = lowered.slice(0, atIndex);
  const plusIndex = local.indexOf('+');
  if (plusIndex > 0) local = local.slice(0, plusIndex);
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/** Caller acting for themselves: 403 SIGNUP_BLOCKED or 403 PLAYER_DEACTIVATED, else null. */
export function callerRefusal(player: DisciplineFields, now: Date = new Date()): APIGatewayProxyResult | null {
  if (isDeactivated(player)) {
    return refused(403, 'PLAYER_DEACTIVATED', 'Your account has been deactivated');
  }
  const { status, signupBlockedUntil } = computeDiscipline(player, now);
  if (status !== 'signup-blocked' || signupBlockedUntil === null) return null;
  return refused(403, 'SIGNUP_BLOCKED', `You cannot sign up until ${signupBlockedUntil}`, {
    blockedUntil: signupBlockedUntil,
  });
}

/** The other party to a member action: 409 PLAYER_UNAVAILABLE, else null. Says nothing about why. */
export function targetRefusal(player: DisciplineFields, now: Date = new Date()): APIGatewayProxyResult | null {
  if (!isSignupBlocked(player, now)) return null;
  return refused(409, 'PLAYER_UNAVAILABLE', 'That player is not available right now');
}

/** Staff action adding this player: 409 PLAYER_DEACTIVATED, else null. Sign-up blocks pass. */
export function bookingRefusal(player: DisciplineFields & { name?: string }): APIGatewayProxyResult | null {
  if (!isDeactivated(player)) return null;
  const subject = player.name ?? 'This player';
  return refused(409, 'PLAYER_DEACTIVATED', `${subject} is deactivated and cannot be added`);
}
