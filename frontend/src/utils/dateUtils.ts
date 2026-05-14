/**
 * Date formatting utilities for consistent date display across the application.
 */

/**
 * Normalize a value to a calendar date string `YYYY-MM-DD`.
 *
 * Why this exists: events store a calendar day (no time), but legacy rows are
 * full ISO timestamps. Stripping to the UTC date portion gives a single
 * representation that renders identically in every viewer timezone.
 */
export function toCalendarDate(value: string): string {
  if (!value) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? value;
}

/**
 * Serialize a local `Date` to `YYYY-MM-DD` using its local calendar
 * components — used when the user picked a day on a calendar grid that
 * was rendered in their local timezone.
 */
export function dateToCalendarDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a calendar date for display. Accepts `YYYY-MM-DD` or a legacy ISO
 * timestamp; always renders the same calendar day regardless of viewer
 * timezone (anchored to UTC).
 */
export function formatCalendarDate(
  value: string,
  locale?: string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  const ymd = toCalendarDate(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return value;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
}

/**
 * Formats a date string to a localized short date format.
 * Example: "Jan 15, 2024"
 *
 * @param dateString - ISO date string to format
 * @returns Formatted date string
 */
export const formatDate = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
};

/**
 * Formats a date string to a localized date and time format.
 * Example: "Jan 15, 2024, 2:30 PM"
 *
 * @param dateString - ISO date string to format
 * @returns Formatted date and time string
 */
export const formatDateTime = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

/**
 * Formats a date string to show only the time.
 * Example: "2:30 PM"
 *
 * @param dateString - ISO date string to format
 * @returns Formatted time string
 */
export const formatTime = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

/**
 * Formats a date string to a relative time format.
 * Example: "2 days ago", "in 3 hours"
 *
 * @param dateString - ISO date string to format
 * @returns Relative time string
 */
export const formatRelativeTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString; // Return original string for invalid dates
    }
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    const intervals = [
      { label: 'year', seconds: 31536000 },
      { label: 'month', seconds: 2592000 },
      { label: 'day', seconds: 86400 },
      { label: 'hour', seconds: 3600 },
      { label: 'minute', seconds: 60 },
    ];

    for (const interval of intervals) {
      const count = Math.floor(Math.abs(diffInSeconds) / interval.seconds);
      if (count >= 1) {
        const plural = count !== 1 ? 's' : '';
        if (diffInSeconds > 0) {
          return `${count} ${interval.label}${plural} ago`;
        } else {
          return `in ${count} ${interval.label}${plural}`;
        }
      }
    }

    return 'just now';
  } catch {
    return dateString;
  }
};
