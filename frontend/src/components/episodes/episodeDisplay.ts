/**
 * Formats a YYYY-MM-DD air date as a local calendar date. Parsing the string
 * with `new Date()` would read it as UTC midnight and show the day before in
 * timezones west of UTC.
 */
export function formatAirDate(airDate: string, locale?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(airDate);
  if (!match) return airDate;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(locale);
}

/** Today as YYYY-MM-DD in the viewer's timezone, the default air date for a new episode. */
export function todayAirDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
