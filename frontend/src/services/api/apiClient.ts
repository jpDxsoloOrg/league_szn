import i18n from 'i18next';
import { formatInstant } from '../../utils/dateUtils';
import { translateOutsideReact } from '../../utils/translateOutsideReact';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Helper to get auth token from session storage (uses Cognito access token)
export const getAuthToken = (): string | null => {
  return sessionStorage.getItem('accessToken');
};

/** Fired when a signed-in request gets a 401 that a refresh could not fix. */
export const AUTH_EXPIRED_EVENT = 'league:auth-expired';

/** Fired on any SIGNUP_BLOCKED refusal: the block began after the profile was loaded. */
export const SIGNUP_BLOCKED_EVENT = 'league:signup-blocked';

/** Refusals the server sends with a `code`. Its `message` stays English, so these translate here. */
const DISCIPLINE_REFUSAL_CODES = new Set([
  'SIGNUP_BLOCKED',
  'PLAYER_DEACTIVATED',
  'PLAYER_UNAVAILABLE',
  'ALREADY_DEACTIVATED',
  'NOT_DEACTIVATED',
  'STAFF_PROTECTED',
  'DISCIPLINE_CONFLICT',
  'STRIKE_NOT_ACTIVE',
  'DISCIPLINE_ACTIVE',
  'PSN_ID_UNAVAILABLE',
  'PSN_ID_LOCKED',
]);

interface ApiErrorBody {
  message?: string;
  code?: string;
  blockedUntil?: string;
}

/**
 * A failed API response. `status` is the HTTP code and `code` the refusal code,
 * if any. `message` is the server's, or its translation for a known code, so
 * call sites that show `err.message` need no changes.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly blockedUntil?: string;

  constructor(message: string, status: number, details: { code?: string; blockedUntil?: string } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = details.code;
    this.blockedUntil = details.blockedUntil;
  }
}

const refusalMessage = ({ code, blockedUntil }: ApiErrorBody, serverMessage: string): string => {
  if (!code || !DISCIPLINE_REFUSAL_CODES.has(code)) return serverMessage;
  if (code === 'SIGNUP_BLOCKED' && blockedUntil) {
    return translateOutsideReact('discipline.errors.SIGNUP_BLOCKED', serverMessage, {
      date: formatInstant(blockedUntil, i18n.language),
    });
  }
  const key = code === 'SIGNUP_BLOCKED' ? 'SIGNUP_BLOCKED_NO_DATE' : code;
  return translateOutsideReact(`discipline.errors.${key}`, serverMessage);
};

/** True when `err` is an API failure with this status. */
export const isApiError = (err: unknown, status: number): err is ApiError =>
  err instanceof ApiError && err.status === status;

const buildRequest = (
  options: RequestInit,
  token: string | null,
  signal?: AbortSignal,
): RequestInit => {
  // Content-Type is only sent with a body: on a GET it would turn a simple
  // cross-origin request into one that needs a preflight.
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return { ...options, headers, signal };
};

/**
 * Statuses a burst can cause. The account allows few concurrent Lambdas, so a
 * page that fans out can get an instant failure that clears within a second.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);
const MAX_READ_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

const isRead = (options: RequestInit): boolean =>
  (options.method ?? 'GET').toUpperCase() === 'GET';

/** Half to one and a half times the doubling delay, so a failed wave spreads out. */
const retryDelayMs = (retryNumber: number): number =>
  RETRY_BASE_DELAY_MS * 2 ** retryNumber * (0.5 + Math.random());

const abortError = (): DOMException => new DOMException('The request was aborted.', 'AbortError');

/** Resolves after `delayMs`, or rejects as soon as `signal` aborts. */
const waitForRetry = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** One request, repeated on a transient failure if it is safe to repeat. Writes never are. */
const fetchWithRetry = async (url: string, request: RequestInit, signal?: AbortSignal): Promise<Response> => {
  let response = await fetch(url, request);
  if (!isRead(request)) return response;

  for (let retry = 0; retry < MAX_READ_RETRIES && RETRYABLE_STATUSES.has(response.status); retry += 1) {
    await waitForRetry(retryDelayMs(retry), signal);
    response = await fetch(url, request);
  }
  return response;
};

// Helper to make authenticated requests with optional abort signal
export const fetchWithAuth = async (url: string, options: RequestInit = {}, signal?: AbortSignal) => {
  const token = getAuthToken();
  let response = await fetchWithRetry(url, buildRequest(options, token, signal), signal);

  // Access tokens live 24h but admin tabs stay open longer: a 401 on a
  // request that carried a token usually means it expired mid-session.
  // Refresh once (30-day refresh token) and retry before giving up.
  // Imported lazily so the amplify-backed cognito module only loads on
  // the rare 401 path, not for every API consumer.
  if (response.status === 401 && token) {
    const { cognitoAuth } = await import('../cognito');
    const refreshed = await cognitoAuth.refreshSession();
    if (refreshed) {
      response = await fetchWithRetry(url, buildRequest(options, refreshed.accessToken, signal), signal);
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      throw new ApiError('Your session has expired. Please sign in again.', response.status);
    }
    const error: ApiErrorBody = await response.json().catch(() => ({ message: 'Request failed' }));
    if (error.code === 'SIGNUP_BLOCKED') window.dispatchEvent(new Event(SIGNUP_BLOCKED_EVENT));
    throw new ApiError(
      refusalMessage(error, error.message || `HTTP ${response.status}`),
      response.status,
      { code: error.code, blockedUntil: error.blockedUntil },
    );
  }

  // Handle 204 No Content responses (e.g., from DELETE operations)
  if (response.status === 204) {
    return undefined;
  }

  return response.json();
};
