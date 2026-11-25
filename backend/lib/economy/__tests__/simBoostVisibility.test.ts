import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '../../auth';
import type { SimBoost } from '../../repositories/types';

const { mockFindByUserId } = vi.hoisted(() => ({ mockFindByUserId: vi.fn() }));

vi.mock('../../repositories', () => ({
  getRepositories: () => ({ roster: { players: { findByUserId: mockFindByUserId } } }),
}));

import {
  anyMatchHasSimBoosts,
  playerSimBoostViewer,
  resolveSimBoostViewer,
  withVisibleSimBoosts,
} from '../simBoostVisibility';

const mine: SimBoost = { playerId: 'p-me', boost: 5, purchasedAt: '2026-11-20T00:00:00Z', purchaseKey: 'purchase:me' };
const theirs: SimBoost = { playerId: 'p-them', boost: 5, purchasedAt: '2026-11-21T00:00:00Z', purchaseKey: 'purchase:them' };
const match = { matchId: 'm1', participants: ['p-me', 'p-them'], simBoosts: [mine, theirs] };

function caller(groups: AuthContext['groups'], sub = 'sub-me'): AuthContext {
  return { username: 'u', email: '', groups, sub };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindByUserId.mockResolvedValue({ playerId: 'p-me' });
});

describe('resolveSimBoostViewer', () => {
  it('is public for anonymous callers without a lookup', async () => {
    expect(await resolveSimBoostViewer(null)).toEqual({ kind: 'public' });
    expect(mockFindByUserId).not.toHaveBeenCalled();
  });

  it('is staff for Admins and Moderators without a lookup', async () => {
    expect(await resolveSimBoostViewer(caller(['Admin']))).toEqual({ kind: 'staff' });
    expect(await resolveSimBoostViewer(caller(['Moderator']))).toEqual({ kind: 'staff' });
    expect(mockFindByUserId).not.toHaveBeenCalled();
  });

  it('resolves a signed-in player to their player id', async () => {
    expect(await resolveSimBoostViewer(caller(['Wrestler']))).toEqual({ kind: 'player', playerId: 'p-me' });
    expect(mockFindByUserId).toHaveBeenCalledWith('sub-me');
  });

  it('is public for a signed-in user with no player', async () => {
    mockFindByUserId.mockResolvedValue(null);
    expect(await resolveSimBoostViewer(caller(['Wrestler']))).toEqual({ kind: 'public' });
  });

  it('skips the lookup when no boosts need it', async () => {
    expect(await resolveSimBoostViewer(caller(['Wrestler']), false)).toEqual({ kind: 'public' });
    expect(mockFindByUserId).not.toHaveBeenCalled();
  });
});

describe('playerSimBoostViewer', () => {
  it('keeps staff as staff and a known player as that player', () => {
    expect(playerSimBoostViewer(caller(['Moderator']), 'p-me')).toEqual({ kind: 'staff' });
    expect(playerSimBoostViewer(caller(['Wrestler']), 'p-me')).toEqual({ kind: 'player', playerId: 'p-me' });
    expect(playerSimBoostViewer(caller(['Wrestler']), null)).toEqual({ kind: 'public' });
  });
});

describe('withVisibleSimBoosts', () => {
  it('gives staff every boost', () => {
    expect(withVisibleSimBoosts(match, { kind: 'staff' }).simBoosts).toEqual([mine, theirs]);
  });

  it('gives a player only their own boost, without the ledger key', () => {
    const visible = withVisibleSimBoosts(match, { kind: 'player', playerId: 'p-me' });
    expect(visible.simBoosts).toEqual([{ playerId: 'p-me', boost: 5, purchasedAt: '2026-11-20T00:00:00Z' }]);
  });

  it('omits the field for a player who did not boost', () => {
    const visible = withVisibleSimBoosts(match, { kind: 'player', playerId: 'p-other' });
    expect(visible).not.toHaveProperty('simBoosts');
    expect(visible.matchId).toBe('m1');
  });

  it('omits the field for the public', () => {
    expect(withVisibleSimBoosts(match, { kind: 'public' })).not.toHaveProperty('simBoosts');
  });

  it('leaves matches without boosts alone', () => {
    const plain: { matchId: string; simBoosts?: SimBoost[] } = { matchId: 'm2' };
    expect(withVisibleSimBoosts(plain, { kind: 'staff' })).toEqual({ matchId: 'm2' });
  });
});

describe('anyMatchHasSimBoosts', () => {
  it('is true only when some match has a non-empty list', () => {
    expect(anyMatchHasSimBoosts([{ simBoosts: [] }, {}])).toBe(false);
    expect(anyMatchHasSimBoosts([{}, match])).toBe(true);
  });
});
