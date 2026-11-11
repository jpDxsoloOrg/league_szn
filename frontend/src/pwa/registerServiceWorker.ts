import { logger } from '../utils/logger';

export const SERVICE_WORKER_URL = '/sw.js';

interface RegisterServiceWorkerOptions {
  /** Production builds only. Dev servers and tests never register a worker. */
  isProduction?: boolean;
  /** Injected by tests; defaults to the browser's own. */
  targetWindow?: Window;
}

async function register(container: ServiceWorkerContainer): Promise<void> {
  try {
    await container.register(SERVICE_WORKER_URL, { scope: '/' });
  } catch (error) {
    logger.error('Service worker registration failed', error);
  }
}

/**
 * Registers public/sw.js once the page has loaded, so the worker's install
 * never competes with the app's first requests.
 */
export function registerServiceWorker({
  isProduction = import.meta.env.PROD,
  targetWindow = window,
}: RegisterServiceWorkerOptions = {}): void {
  if (!isProduction) return;
  const { navigator: targetNavigator, document: targetDocument } = targetWindow;
  if (!('serviceWorker' in targetNavigator)) return;
  const container = targetNavigator.serviceWorker;

  if (targetDocument.readyState === 'complete') {
    void register(container);
    return;
  }
  targetWindow.addEventListener('load', () => void register(container), { once: true });
}
