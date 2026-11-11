const RELOAD_MARKER_KEY = 'preload-reload-at';
const RELOAD_WINDOW_MS = 60_000;

function readMarker(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_MARKER_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeMarker(timestamp: number): void {
  try {
    sessionStorage.setItem(RELOAD_MARKER_KEY, String(timestamp));
  } catch {
    // Storage can be blocked. The reload below still recovers the page.
  }
}

/**
 * A tab left open across a deploy can ask for a route chunk that no longer
 * exists. Reload once to pick up the new build. A second failure inside the
 * window is left to surface, so the error boundary shows instead of a loop.
 */
export function installPreloadRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    const now = Date.now();
    if (now - readMarker() < RELOAD_WINDOW_MS) return;
    event.preventDefault();
    writeMarker(now);
    window.location.reload();
  });
}
