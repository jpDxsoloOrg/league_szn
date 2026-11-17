import { TICKER_TEXT_MAX_LENGTH } from '../../lib/repositories';
import type { TickerMessage, TickerMessagePatch } from '../../lib/repositories';

export const TICKER_HREF_MAX_LENGTH = 500;

export interface TickerMessageBody {
  text?: unknown;
  href?: unknown;
  pinned?: unknown;
  startsAt?: unknown;
  expiresAt?: unknown;
}

export interface ValidTickerMessageCreate {
  text: string;
  href?: string;
  pinned: boolean;
  startsAt: string;
  expiresAt: string;
}

type Result<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

const isBlank = (value: unknown): boolean => value === undefined || value === null || value === '';

function validateText(text: unknown): Result<string> {
  if (typeof text !== 'string' || text.trim().length === 0) return { error: 'text is required' };
  if (text.trim().length > TICKER_TEXT_MAX_LENGTH) {
    return { error: `text must be ${TICKER_TEXT_MAX_LENGTH} characters or fewer` };
  }
  return { value: text.trim() };
}

/** A site path ("/events", not "//host") or an absolute http(s) URL. */
function validateHref(href: unknown): Result<string> {
  if (typeof href !== 'string') return { error: 'href must be a string' };
  const trimmed = href.trim();
  if (trimmed.length > TICKER_HREF_MAX_LENGTH) {
    return { error: `href must be ${TICKER_HREF_MAX_LENGTH} characters or fewer` };
  }
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return { value: trimmed };
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return { value: trimmed };
  } catch {
    // Not a URL; reported below.
  }
  return { error: 'href must be a site path starting with / or an http(s) URL' };
}

function validateDate(value: unknown, field: string): Result<string> {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return { error: `${field} must be an ISO date-time` };
  }
  return { value: new Date(value).toISOString() };
}

function checkWindow(startsAt: string, expiresAt: string): string | undefined {
  return expiresAt > startsAt ? undefined : 'expiresAt must be after startsAt';
}

/** startsAt defaults to `now`; expiresAt is required and must be after startsAt. */
export function validateCreateTickerMessage(
  body: TickerMessageBody,
  now: Date = new Date(),
): Result<ValidTickerMessageCreate> {
  const text = validateText(body.text);
  if (text.error !== undefined) return { error: text.error };

  let href: string | undefined;
  if (!isBlank(body.href)) {
    const checked = validateHref(body.href);
    if (checked.error !== undefined) return { error: checked.error };
    href = checked.value;
  }

  if (body.pinned !== undefined && typeof body.pinned !== 'boolean') {
    return { error: 'pinned must be a boolean' };
  }

  const startsAt = isBlank(body.startsAt) ? { value: now.toISOString() } : validateDate(body.startsAt, 'startsAt');
  if (startsAt.error !== undefined) return { error: startsAt.error };

  if (isBlank(body.expiresAt)) return { error: 'expiresAt is required' };
  const expiresAt = validateDate(body.expiresAt, 'expiresAt');
  if (expiresAt.error !== undefined) return { error: expiresAt.error };

  const windowError = checkWindow(startsAt.value, expiresAt.value);
  if (windowError) return { error: windowError };

  return {
    value: {
      text: text.value,
      href,
      pinned: body.pinned === true,
      startsAt: startsAt.value,
      expiresAt: expiresAt.value,
    },
  };
}

/** Validates a partial update against the stored message, so the window check sees both dates. */
export function validateUpdateTickerMessage(
  body: TickerMessageBody,
  existing: TickerMessage,
): Result<TickerMessagePatch> {
  const patch: TickerMessagePatch = {};

  if (body.text !== undefined) {
    const text = validateText(body.text);
    if (text.error !== undefined) return { error: text.error };
    patch.text = text.value;
  }

  if (body.href === null || body.href === '') {
    patch.href = null;
  } else if (body.href !== undefined) {
    const href = validateHref(body.href);
    if (href.error !== undefined) return { error: href.error };
    patch.href = href.value;
  }

  if (body.pinned !== undefined) {
    if (typeof body.pinned !== 'boolean') return { error: 'pinned must be a boolean' };
    patch.pinned = body.pinned;
  }

  if (body.startsAt !== undefined) {
    const startsAt = validateDate(body.startsAt, 'startsAt');
    if (startsAt.error !== undefined) return { error: startsAt.error };
    patch.startsAt = startsAt.value;
  }

  if (body.expiresAt !== undefined) {
    const expiresAt = validateDate(body.expiresAt, 'expiresAt');
    if (expiresAt.error !== undefined) return { error: expiresAt.error };
    patch.expiresAt = expiresAt.value;
  }

  const windowError = checkWindow(patch.startsAt ?? existing.startsAt, patch.expiresAt ?? existing.expiresAt);
  if (windowError) return { error: windowError };

  return { value: patch };
}
