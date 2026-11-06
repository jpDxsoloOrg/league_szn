import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVisiblePolling } from '../useVisiblePolling';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useVisiblePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('runs at once and then on every interval', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(callback, 1000, true));
    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(callback).toHaveBeenCalledTimes(4);
  });

  it('does nothing while disabled', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(callback, 1000, false));

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(callback).not.toHaveBeenCalled();
  });

  it('stops while the tab is hidden and catches up when it returns', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(callback, 1000, true));
    callback.mockClear();

    act(() => setHidden(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(callback).not.toHaveBeenCalled();

    act(() => setHidden(false));
    expect(callback).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('makes no request when mounted in a hidden tab', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const callback = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(callback, 1000, true));

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(callback).not.toHaveBeenCalled();
  });

  it('skips a tick while the previous one is still running', async () => {
    let finish: () => void = () => undefined;
    const callback = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderHook(() => useVisiblePolling(callback, 1000, true));

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('stops polling on unmount', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useVisiblePolling(callback, 1000, true));
    callback.mockClear();

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(callback).not.toHaveBeenCalled();
  });
});
