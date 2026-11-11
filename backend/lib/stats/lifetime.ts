import { normalizeCalendarDate } from '../calendarDate';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The period a team or faction existed. No endedAt means it still exists. */
export interface Lifetime {
  createdAt?: string;
  endedAt?: string;
}

/**
 * True when a match falls within a lifetime, both end days included.
 * Compares calendar days because a match booked on an event carries the date
 * alone, which would otherwise sort before a team formed earlier that day.
 * createdAt is a UTC time, so a team formed on a US evening carries the next
 * day. A date-only match has no time to compare, so it gets one day of grace.
 * A date that cannot be read sets no limit.
 */
export function isWithinLifetime(matchDate: string, lifetime: Lifetime): boolean {
  const matchDay = normalizeCalendarDate(matchDate);
  if (!matchDay) return true;
  const formedDay = normalizeCalendarDate(lifetime.createdAt);
  const firstDay = formedDay && matchDate.length === formedDay.length
    ? new Date(Date.parse(formedDay) - MS_PER_DAY).toISOString().slice(0, 10)
    : formedDay;
  const lastDay = normalizeCalendarDate(lifetime.endedAt);
  return (!firstDay || matchDay >= firstDay) && (!lastDay || matchDay <= lastDay);
}
