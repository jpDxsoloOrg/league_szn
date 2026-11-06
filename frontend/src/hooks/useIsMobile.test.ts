import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MOBILE_MEDIA_QUERY, useIsMobile } from './useIsMobile';

function installMatchMedia(matches: boolean) {
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => {
      listener = callback;
    },
    removeEventListener: vi.fn(),
  }));
  return (nextMatches: boolean) => listener?.({ matches: nextMatches } as MediaQueryListEvent);
}

describe('useIsMobile', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('is false on a desktop-width match', () => {
    installMatchMedia(false);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
  });

  it('follows the mobile breakpoint', () => {
    const change = installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());

    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_MEDIA_QUERY);
    expect(result.current).toBe(true);

    act(() => change(false));
    expect(result.current).toBe(false);
  });
});
