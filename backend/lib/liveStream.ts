import type { LiveStreamSettings } from './repositories/SiteConfigRepository';

/** A stream marked live longer ago than this reads as offline (a GM forgot to end it). */
export const LIVE_STREAM_MAX_HOURS = 8;
export const LIVE_STREAM_MAX_MS = LIVE_STREAM_MAX_HOURS * 60 * 60 * 1000;

/** Twitch logins: 4-25 letters, digits or underscores. */
export const TWITCH_CHANNEL_RE = /^[A-Za-z0-9_]{4,25}$/;
export const LIVE_STREAM_TITLE_MAX_LENGTH = 120;

/** What GET /live-stream returns. */
export interface PublicLiveStream {
  channel: string;
  /** Already passed through the 8-hour guard. */
  isLive: boolean;
  title?: string;
  /** Present only while isLive is true. */
  liveSince?: string;
}

/**
 * True while the stream is marked live, has a channel, and was marked live
 * no more than LIVE_STREAM_MAX_HOURS ago. Read-time only: nothing is written.
 */
export function isLiveStreamActive(settings: LiveStreamSettings, now: Date = new Date()): boolean {
  if (!settings.isLive || !settings.channel || !settings.liveSince) return false;
  const since = Date.parse(settings.liveSince);
  if (Number.isNaN(since)) return false;
  return now.getTime() - since <= LIVE_STREAM_MAX_MS;
}

export function toPublicLiveStream(settings: LiveStreamSettings, now: Date = new Date()): PublicLiveStream {
  const isLive = isLiveStreamActive(settings, now);
  const view: PublicLiveStream = { channel: settings.channel, isLive };
  if (settings.title) view.title = settings.title;
  if (isLive && settings.liveSince) view.liveSince = settings.liveSince;
  return view;
}
