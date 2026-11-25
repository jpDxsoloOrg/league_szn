/**
 * The league week (ECO-06): it starts Sunday 00:00 in the league's time zone.
 *
 * The zone is `InjuryTunables.timezone` in site config (INJ-01), default
 * `America/New_York`; the weekly jobs handler reads it on every tick.
 *
 * Scheduled jobs run hourly rather than on an EventBridge cron, because cron
 * is UTC and ignores DST; checking the local week every hour is always right.
 */

export const DEFAULT_LEAGUE_TIME_ZONE = 'America/New_York';

export interface LeagueWeek {
  /** Local calendar date of the Sunday the week starts on, `YYYY-MM-DD`. */
  weekKey: string;
  /** The instant the week started: Sunday 00:00 local, as a UTC Date. */
  weekStart: Date;
  /** True while it is still Sunday locally. */
  isSunday: boolean;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(instant: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** Milliseconds the zone is ahead of UTC at `instant`. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const local = localParts(instant, timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of 00:00 local time on the given local calendar date. */
function localMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day);
  // Two passes settle the offset even when midnight sits next to a DST change.
  let instant = guess - zoneOffsetMs(new Date(guess), timeZone);
  instant = guess - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The league week `now` falls in. */
export function leagueWeekOf(now: Date, timeZone: string = DEFAULT_LEAGUE_TIME_ZONE): LeagueWeek {
  const local = localParts(now, timeZone);
  // Step back to the local Sunday with plain calendar arithmetic (UTC has no DST).
  const sunday = new Date(Date.UTC(local.year, local.month - 1, local.day - local.weekday));
  const year = sunday.getUTCFullYear();
  const month = sunday.getUTCMonth() + 1;
  const day = sunday.getUTCDate();
  return {
    weekKey: `${year}-${pad(month)}-${pad(day)}`,
    weekStart: localMidnight(year, month, day, timeZone),
    isSunday: local.weekday === 0,
  };
}
