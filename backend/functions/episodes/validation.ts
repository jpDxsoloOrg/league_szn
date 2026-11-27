/**
 * Field rules shared by createEpisode and updateEpisode. Each check returns
 * an error message or the cleaned value.
 */

export const EPISODE_TITLE_MAX_LENGTH = 200;
export const EPISODE_CHANNEL_MAX_LENGTH = 200;
export const EPISODE_DESCRIPTION_MAX_LENGTH = 5000;

export type Checked<T> = { value: T; error?: never } | { value?: never; error: string };

const AIR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function checkTitle(raw: unknown): Checked<string> {
  const title = typeof raw === 'string' ? raw.trim() : '';
  if (title.length === 0) return { error: 'Title required' };
  if (title.length > EPISODE_TITLE_MAX_LENGTH) {
    return { error: `Title must be at most ${EPISODE_TITLE_MAX_LENGTH} characters` };
  }
  return { value: title };
}

export function checkChannelName(raw: unknown): Checked<string> {
  if (typeof raw !== 'string') return { error: 'channelName must be a string' };
  const channelName = raw.trim();
  if (channelName.length > EPISODE_CHANNEL_MAX_LENGTH) {
    return { error: `channelName must be at most ${EPISODE_CHANNEL_MAX_LENGTH} characters` };
  }
  return { value: channelName };
}

export function checkDescription(raw: unknown): Checked<string> {
  if (typeof raw !== 'string') return { error: 'description must be a string' };
  const description = raw.trim();
  if (description.length > EPISODE_DESCRIPTION_MAX_LENGTH) {
    return { error: `description must be at most ${EPISODE_DESCRIPTION_MAX_LENGTH} characters` };
  }
  return { value: description };
}

/** A real calendar day as YYYY-MM-DD (2026-02-30 fails). */
export function checkAirDate(raw: unknown): Checked<string> {
  const message = 'airDate must be a date as YYYY-MM-DD';
  if (typeof raw !== 'string') return { error: message };
  const match = AIR_DATE_RE.exec(raw);
  if (!match) return { error: message };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return { error: message };
  }
  return { value: raw };
}

/** Today's date in UTC as YYYY-MM-DD, the default air date. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function checkIsPublished(raw: unknown): Checked<boolean | undefined> {
  if (raw === undefined) return { value: undefined };
  if (typeof raw !== 'boolean') return { error: 'isPublished must be a boolean' };
  return { value: raw };
}

/**
 * A link field (eventId, episodeId): undefined when absent, null to unlink
 * ('' counts as null), otherwise the trimmed id.
 */
export function checkLinkId(raw: unknown, field: string): Checked<string | null | undefined> {
  if (raw === undefined) return { value: undefined };
  if (raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: `${field} must be a string or null` };
  const id = raw.trim();
  return { value: id.length === 0 ? null : id };
}
