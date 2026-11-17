import { TICKER_TEXT_MAX_LENGTH } from '../../services/api/tickerMessages.api';
import type { CreateTickerMessageInput, UpdateTickerMessageInput } from '../../services/api/tickerMessages.api';
import type { TickerMessage } from '../../types';

export type TickerMessageStatus = 'scheduled' | 'live' | 'expired';

/** How long a ticker message runs when the GM does not pick an end. */
export const DEFAULT_TICKER_DURATION_MS = 24 * 60 * 60 * 1000;

export function getTickerMessageStatus(message: TickerMessage, now: Date = new Date()): TickerMessageStatus {
  const nowIso = now.toISOString();
  if (message.expiresAt <= nowIso) return 'expired';
  if (message.startsAt > nowIso) return 'scheduled';
  return 'live';
}

/** ISO date-time to the value a `datetime-local` input wants, in the viewer's time zone. */
export function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** A `datetime-local` value (local time) to an ISO date-time. */
export function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}

/**
 * The update that ends a message now. A message that has not started yet
 * gets its start moved back too, so the end still comes after the start.
 */
export function expireNowPatch(message: TickerMessage, now: Date = new Date()): UpdateTickerMessageInput {
  const nowIso = now.toISOString();
  const patch: UpdateTickerMessageInput = { expiresAt: nowIso };
  if (message.startsAt >= nowIso) patch.startsAt = new Date(now.getTime() - 1000).toISOString();
  return patch;
}

/** Shortens text to the ticker limit, ending with an ellipsis when cut. */
export function clampTickerText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= TICKER_TEXT_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, TICKER_TEXT_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * The ticker message the Breaking News wizard posts alongside its
 * announcement: the headline, linking to the news story, running until the
 * announcement expires or for a day.
 */
export function buildBreakingNewsTickerMessage(
  headline: string,
  announcementId: string,
  announcementExpiresAt: string | undefined,
  now: Date = new Date(),
): CreateTickerMessageInput {
  const fallbackEnd = new Date(now.getTime() + DEFAULT_TICKER_DURATION_MS).toISOString();
  const expiresAt = announcementExpiresAt && announcementExpiresAt > now.toISOString()
    ? announcementExpiresAt
    : fallbackEnd;
  return {
    text: clampTickerText(headline),
    href: `/news/${announcementId}`,
    startsAt: now.toISOString(),
    expiresAt,
  };
}
