/**
 * Normalize a date input to a calendar date string `YYYY-MM-DD`.
 *
 * Accepts `YYYY-MM-DD` directly, or a longer ISO timestamp where the leading
 * date portion is taken as the calendar day. Returns `null` for anything that
 * cannot be coerced — callers should treat that as a validation failure.
 *
 * Events represent a calendar day, not an instant. Storing the date this way
 * keeps display identical across viewer timezones.
 */
export function normalizeCalendarDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 10) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${m}-${d}`;
}
