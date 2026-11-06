import { describe, it, expect } from 'vitest';
import { toPublicPlayer } from '../publicPlayer';
import type { AuthContext, UserRole } from '../auth';

function caller(sub: string, ...groups: UserRole[]): AuthContext {
  return { sub, groups, username: sub, email: '' };
}

const player = { playerId: 'p1', name: 'Rock', userId: 'owner-sub', psnId: 'rock_psn' };

describe('toPublicPlayer', () => {
  it('hides the account id from anonymous callers', () => {
    const shaped = toPublicPlayer(player, null);

    expect(shaped).not.toHaveProperty('userId');
    expect(shaped).toMatchObject({ playerId: 'p1', psnId: 'rock_psn', hasLinkedAccount: true });
  });

  it('hides the account id from other wrestlers', () => {
    expect(toPublicPlayer(player, caller('other-sub', 'Wrestler'))).not.toHaveProperty('userId');
  });

  it('gives the player their own account id', () => {
    expect(toPublicPlayer(player, caller('owner-sub', 'Wrestler')).userId).toBe('owner-sub');
  });

  it.each(['Admin', 'Moderator'] as const)('gives %s the account id', (role) => {
    expect(toPublicPlayer(player, caller('staff-sub', role)).userId).toBe('owner-sub');
  });

  it('reports an unlinked player as such', () => {
    const unlinked: { playerId: string; userId?: string } = { playerId: 'p2' };
    const shaped = toPublicPlayer(unlinked, caller('staff-sub', 'Admin'));

    expect(shaped.hasLinkedAccount).toBe(false);
    expect(shaped).not.toHaveProperty('userId');
  });
});
