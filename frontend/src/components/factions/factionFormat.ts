type Translate = (key: string, fallback: string, options?: Record<string, unknown>) => string;

/** Guards legacy records whose counters are missing or negative. */
function safeCount(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export function formatRecord(
  wins: number | null | undefined,
  losses: number | null | undefined,
  draws: number | null | undefined,
): string {
  return `${safeCount(wins)}-${safeCount(losses)}-${safeCount(draws)}`;
}

/** Win rate from a record, or an em dash before the first match. */
export function formatWinRate(wins: number, losses: number, draws: number): string {
  const total = wins + losses + draws;
  return total > 0 ? `${((wins / total) * 100).toFixed(1)}%` : '—';
}

export function formatCountdown(scheduledFor: string, now: number, t: Translate): string {
  const target = new Date(scheduledFor).getTime();
  if (!Number.isFinite(target)) return '';
  const minutes = Math.round((target - now) / 60_000);
  if (Math.abs(minutes) < 60) {
    return minutes >= 0
      ? t('factions.schedule.inMinutes', 'In {{count}}m', { count: minutes })
      : t('factions.schedule.minutesAgo', '{{count}}m ago', { count: -minutes });
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return hours >= 0
      ? t('factions.schedule.inHours', 'In {{count}}h', { count: hours })
      : t('factions.schedule.hoursAgo', '{{count}}h ago', { count: -hours });
  }
  const days = Math.round(hours / 24);
  return days >= 0
    ? t('factions.schedule.inDays', 'In {{count}} days', { count: days })
    : t('factions.schedule.daysAgo', '{{count}} days ago', { count: -days });
}

export type StreakResult = 'W' | 'L' | 'D';

export interface Streak {
  type: StreakResult;
  count: number;
}

/** Faction endpoints send a streak either as an object or as a string such as "L1". */
export function normalizeStreak(streak: Streak | string | null | undefined): Streak | undefined {
  if (!streak) return undefined;
  if (typeof streak !== 'string') return streak.count > 0 ? streak : undefined;
  const match = /^([WLD])(\d+)$/.exec(streak);
  const [, type, count] = match ?? [];
  if (type !== 'W' && type !== 'L' && type !== 'D') return undefined;
  return { type, count: Number(count) };
}
