import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Player } from '../../types';

const authState = vi.hoisted(() => ({ profile: null as Pick<Player, 'discipline'> | null }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }));

import { useSignupBlock } from '../useSignupBlock';

const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const DAY = 86_400_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  authState.profile = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSignupBlock', () => {
  it('reports no block without a profile', () => {
    expect(renderHook(() => useSignupBlock()).result.current).toEqual({ blocked: false, until: null });
  });

  it('holds until the boundary, then lifts in an open tab with no refresh', () => {
    const until = new Date(NOW + DAY).toISOString();
    authState.profile = {
      discipline: {
        status: 'signup-blocked',
        activeStrikeCount: 2,
        activeStrikes: [],
        cooldownEndsAt: new Date(NOW + 8 * DAY).toISOString(),
        signupBlockedUntil: until,
        deactivatedAt: null,
      },
    };
    const { result } = renderHook(() => useSignupBlock());
    expect(result.current).toEqual({ blocked: true, until });

    act(() => {
      vi.advanceTimersByTime(DAY - 1);
    });
    expect(result.current.blocked).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual({ blocked: false, until: null });
  });
});
