/**
 * Date formatting utilities for consistent date display across the application.
 */

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
