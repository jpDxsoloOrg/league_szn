import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_WORKER_URL, registerServiceWorker } from '../registerServiceWorker';

function createWindow({ withServiceWorker, readyState }: { withServiceWorker: boolean; readyState: DocumentReadyState }) {
  const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
  const listeners = new Map<string, () => void>();
  const navigatorStub = withServiceWorker ? { serviceWorker: { register } } : {};
  const targetWindow = {
    navigator: navigatorStub,
    document: { readyState },
    addEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, listener);
    }),
  } as unknown as Window;
  return { targetWindow, register, fireLoad: () => listeners.get('load')?.() };
}

describe('registerServiceWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing outside production builds, which includes the test run', () => {
    const { targetWindow, register } = createWindow({ withServiceWorker: true, readyState: 'complete' });

    registerServiceWorker({ targetWindow });
    registerServiceWorker({ isProduction: false, targetWindow });

    expect(import.meta.env.PROD).toBe(false);
    expect(register).not.toHaveBeenCalled();
    expect(targetWindow.addEventListener).not.toHaveBeenCalled();
  });

  it('does nothing in browsers without service workers', () => {
    const { targetWindow } = createWindow({ withServiceWorker: false, readyState: 'complete' });

    expect(() => registerServiceWorker({ isProduction: true, targetWindow })).not.toThrow();
    expect(targetWindow.addEventListener).not.toHaveBeenCalled();
  });

  it('is a no-op in jsdom, which has no service worker support', () => {
    expect('serviceWorker' in navigator).toBe(false);
    expect(() => registerServiceWorker({ isProduction: true })).not.toThrow();
  });

  it('waits for the load event, then registers /sw.js at the root scope', () => {
    const { targetWindow, register, fireLoad } = createWindow({ withServiceWorker: true, readyState: 'loading' });

    registerServiceWorker({ isProduction: true, targetWindow });
    expect(register).not.toHaveBeenCalled();

    fireLoad();
    expect(register).toHaveBeenCalledWith(SERVICE_WORKER_URL, { scope: '/' });
  });

  it('registers straight away when the page has already loaded', () => {
    const { targetWindow, register } = createWindow({ withServiceWorker: true, readyState: 'complete' });

    registerServiceWorker({ isProduction: true, targetWindow });

    expect(register).toHaveBeenCalledWith(SERVICE_WORKER_URL, { scope: '/' });
  });

  it('logs and swallows a failed registration', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { targetWindow, register } = createWindow({ withServiceWorker: true, readyState: 'complete' });
    register.mockRejectedValueOnce(new Error('bad MIME type'));

    registerServiceWorker({ isProduction: true, targetWindow });
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());

    expect(String(consoleError.mock.calls[0]?.[0])).toContain('Service worker registration failed');
  });
});
