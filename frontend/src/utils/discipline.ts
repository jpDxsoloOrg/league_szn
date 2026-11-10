import type { PlayerDisciplineSummary } from '../types';
import { ApiError } from '../services/api/apiClient';

type MaybeDiscipline = PlayerDisciplineSummary | null | undefined;

const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

/** The longest delay setTimeout honours. Anything larger fires at once. */
export const MAX_TIMER_MS = 2 ** 31 - 1;

/** The server stays the authority: this only decides which controls are on. */
export function isBlockedNow(discipline: MaybeDiscipline, now: number = Date.now()): boolean {
  const until = discipline?.signupBlockedUntil ?? null;
  return until !== null && Date.parse(until) > now;
}

/**
 * The summary as it stands at `now`. A summary is computed when it is read, so
 * in an open tab its windows can end before the next refresh.
 */
export function liveDiscipline(discipline: MaybeDiscipline, now: number = Date.now()): PlayerDisciplineSummary | null {
  if (!discipline) return null;
  if (discipline.status === 'deactivated') return discipline;
  const { cooldownEndsAt } = discipline;
  if (cooldownEndsAt !== null && Date.parse(cooldownEndsAt) <= now) {
    return {
      status: 'clear',
      activeStrikeCount: 0,
      activeStrikes: [],
      cooldownEndsAt: null,
      signupBlockedUntil: null,
      deactivatedAt: null,
    };
  }
  if (discipline.status === 'signup-blocked' && !isBlockedNow(discipline, now)) {
    return { ...discipline, status: 'cooldown', signupBlockedUntil: null };
  }
  return discipline;
}

/** Milliseconds until the next window ends, or null when none is still running. */
export function msUntilNextBoundary(discipline: MaybeDiscipline, now: number = Date.now()): number | null {
  const remaining = [discipline?.signupBlockedUntil, discipline?.cooldownEndsAt]
    .flatMap((iso) => (iso ? [Date.parse(iso) - now] : []))
    .filter((delay) => delay > 0);
  return remaining.length > 0 ? Math.min(...remaining) : null;
}

type Translate = (key: string, options: { count: number }) => string;

/** Up to two units, largest first, with no zero units: "5 days 3 hours", "1 day", "12 minutes 5 seconds", "4 seconds". */
export function formatCountdown(remainingMs: number, t: Translate): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / SECOND_MS));
  const days = Math.floor(totalSeconds / DAY_S);
  const hours = Math.floor((totalSeconds % DAY_S) / HOUR_S);
  const minutes = Math.floor((totalSeconds % HOUR_S) / MINUTE_S);
  const seconds = totalSeconds % MINUTE_S;

  const unit = (name: string, count: number) => t(`discipline.countdown.${name}`, { count });
  const units = [['days', days], ['hours', hours], ['minutes', minutes], ['seconds', seconds]] as const;
  const first = units.findIndex(([, count]) => count > 0);
  if (first < 0) return unit('seconds', 0);
  return units
    .slice(first, first + 2)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => unit(name, count))
    .join(' ');
}

/** The translated refusal when the server sent one, else the caller's generic message. */
export function refusalOr(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.code ? err.message : fallback;
}
