import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePollWhileVisible } from '../usePollWhileVisible';

const setVisibility = (state: DocumentVisibilityState): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('usePollWhileVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('polls on the interval while visible', () => {
    const callback = vi.fn();
    renderHook(() => usePollWhileVisible(callback, 1000));
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('stops while hidden', () => {
    const callback = vi.fn();
    renderHook(() => usePollWhileVisible(callback, 1000));
    setVisibility('hidden');
    vi.advanceTimersByTime(10000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('refreshes at once on return, then resumes the interval', () => {
    const callback = vi.fn();
    renderHook(() => usePollWhileVisible(callback, 1000));
    setVisibility('hidden');
    vi.advanceTimersByTime(5000);
    setVisibility('visible');
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('does not start when mounted in a hidden tab', () => {
    setVisibility('hidden');
    const callback = vi.fn();
    renderHook(() => usePollWhileVisible(callback, 1000));
    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const callback = vi.fn();
    renderHook(() => usePollWhileVisible(callback, 1000, false));
    vi.advanceTimersByTime(5000);
    setVisibility('hidden');
    setVisibility('visible');
    expect(callback).not.toHaveBeenCalled();
  });

  it('uses the latest callback and cleans up on unmount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ callback }) => usePollWhileVisible(callback, 1000),
      { initialProps: { callback: first } },
    );
    rerender({ callback: second });
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(5000);
    setVisibility('hidden');
    setVisibility('visible');
    expect(second).toHaveBeenCalledTimes(1);
  });
});
