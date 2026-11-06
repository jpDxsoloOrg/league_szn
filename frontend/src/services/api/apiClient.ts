export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Helper to get auth token from session storage (uses Cognito access token)
export const getAuthToken = (): string | null => {
  return sessionStorage.getItem('accessToken');
};

/** Fired when a signed-in request gets a 401 that a refresh could not fix. */
export const AUTH_EXPIRED_EVENT = 'league:auth-expired';

/** A failed API response. `message` is the server's, `status` the HTTP code. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

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

// Helper to make authenticated requests with optional abort signal
export const fetchWithAuth = async (url: string, options: RequestInit = {}, signal?: AbortSignal) => {
  const token = getAuthToken();
  let response = await fetch(url, buildRequest(options, token, signal));

  // Access tokens live 24h but admin tabs stay open longer: a 401 on a
  // request that carried a token usually means it expired mid-session.
  // Refresh once (30-day refresh token) and retry before giving up.
  // Imported lazily so the amplify-backed cognito module only loads on
  // the rare 401 path, not for every API consumer.
  if (response.status === 401 && token) {
    const { cognitoAuth } = await import('../cognito');
    const refreshed = await cognitoAuth.refreshSession();
    if (refreshed) {
      response = await fetch(url, buildRequest(options, refreshed.accessToken, signal));
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      throw new ApiError('Your session has expired. Please sign in again.', response.status);
    }
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(error.message || `HTTP ${response.status}`, response.status);
  }

  // Handle 204 No Content responses (e.g., from DELETE operations)
  if (response.status === 204) {
    return undefined;
  }

  return response.json();
};
