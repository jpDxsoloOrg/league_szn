import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installPreloadRecovery } from './preloadRecovery';

describe('installPreloadRecovery', () => {
  const reload = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    reload.mockClear();
    sessionStorage.clear();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  function firePreloadError(): Event {
    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    return event;
  }

  installPreloadRecovery();

  it('reloads once, then lets a repeat failure surface', () => {
    expect(firePreloadError().defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(firePreloadError().defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recovers again after the window has passed', () => {
    firePreloadError();
    vi.advanceTimersByTime(61_000);
    firePreloadError();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
