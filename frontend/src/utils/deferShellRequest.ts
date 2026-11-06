/**
 * How long shell extras (notification count, announcements) hold back on load.
 * The account allows few concurrent Lambdas, and the page's own requests go
 * first, so these two should not add to that burst.
 */
export const SHELL_REQUEST_DELAY_MS = 1200;

/** Resolves once the first page burst has passed, or at once if `signal` aborts. */
export function waitForPageRequests(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, SHELL_REQUEST_DELAY_MS);
    signal.addEventListener('abort', finish, { once: true });
  });
}
