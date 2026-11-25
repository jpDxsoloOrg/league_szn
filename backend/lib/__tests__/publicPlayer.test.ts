import { describe, it, expect } from 'vitest';
import { toOwnPlayer, toPublicPlayer } from '../publicPlayer';
import type { AuthContext, UserRole } from '../auth';
import type { PlayerEffect } from '../repositories/types';
import type { CurrentInjury } from '../repositories/injuries';

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

  describe('account flags', () => {
    const flagged = { ...player, canUploadVideos: true, hasWrestlerRole: false };

    it.each([
      ['an anonymous caller', null],
      ['another wrestler', caller('other-sub', 'Wrestler')],
    ])('hides them from %s', (_label, viewer) => {
      const shaped = toPublicPlayer(flagged, viewer);

      expect(shaped).not.toHaveProperty('canUploadVideos');
      expect(shaped).not.toHaveProperty('hasWrestlerRole');
    });

    it.each([
      ['the player', caller('owner-sub', 'Wrestler')],
      ['an Admin', caller('staff-sub', 'Admin')],
      ['a Moderator', caller('staff-sub', 'Moderator')],
    ])('shows them to %s', (_label, viewer) => {
      expect(toPublicPlayer(flagged, viewer)).toMatchObject({
        canUploadVideos: true,
        hasWrestlerRole: false,
      });
    });

    it('shows staff the flags of a player with no account', () => {
      const unlinked = { playerId: 'p2', canUploadVideos: true };

      expect(toPublicPlayer(unlinked, caller('staff-sub', 'Admin')).canUploadVideos).toBe(true);
    });

    it('does not treat a caller with no id as the owner of an unlinked player', () => {
      const unlinked = { playerId: 'p2', canUploadVideos: true };

      expect(toPublicPlayer(unlinked, caller('', 'Wrestler'))).not.toHaveProperty('canUploadVideos');
    });
  });

  describe('balance (ECO-02)', () => {
    const paid = { ...player, balance: -40 };

    it.each([
      ['an anonymous caller', null],
      ['another wrestler', caller('other-sub', 'Wrestler')],
    ])('hides it from %s', (_label, viewer) => {
      expect(toPublicPlayer(paid, viewer)).not.toHaveProperty('balance');
    });

    it.each([
      ['the player', caller('owner-sub', 'Wrestler')],
      ['a Moderator', caller('staff-sub', 'Moderator')],
    ])('shows it to %s', (_label, viewer) => {
      expect(toPublicPlayer(paid, viewer).balance).toBe(-40);
    });
  });

  // ECO-08
  describe('shop effects', () => {
    const effects: PlayerEffect[] = [{
      effectId: 'e1', purchasedAt: '2026-11-24T00:00:00.000Z', purchaseKey: 'k', kind: 'staminaTopUp', amount: 20,
    }];
    const shopper = { ...player, effects };

    it('hides them from another wrestler', () => {
      expect(toPublicPlayer(shopper, caller('other-sub', 'Wrestler'))).not.toHaveProperty('effects');
    });

    it('shows them to the player', () => {
      expect(toPublicPlayer(shopper, caller('owner-sub', 'Wrestler')).effects).toEqual(effects);
    });
  });

  // ECO-13
  describe('active contract id', () => {
    const signed = { ...player, activeContractId: 'c1' };

    it.each([
      ['an anonymous caller', null],
      ['another wrestler', caller('other-sub', 'Wrestler')],
    ])('hides it from %s', (_label, viewer) => {
      expect(toPublicPlayer(signed, viewer)).not.toHaveProperty('activeContractId');
    });

    it.each([
      ['the player', caller('owner-sub', 'Wrestler')],
      ['a Moderator', caller('staff-sub', 'Moderator')],
    ])('shows it to %s', (_label, viewer) => {
      expect(toPublicPlayer(signed, viewer).activeContractId).toBe('c1');
    });
  });

  // INJ-03
  describe('stamina and current injury', () => {
    const currentInjury: CurrentInjury = {
      injuryId: 'inj-1',
      startedAt: '2026-11-24T20:00:00.000Z',
      returnsAt: '2026-12-06T05:00:00.000Z',
      severity: 'major',
      weeks: 2,
      source: 'storyline',
      note: 'Written off for the movie shoot',
    };
    const publicInjury = {
      injuryId: 'inj-1',
      startedAt: '2026-11-24T20:00:00.000Z',
      returnsAt: '2026-12-06T05:00:00.000Z',
      severity: 'major',
      weeks: 2,
    };
    const hurt = { ...player, stamina: 35, currentInjury };

    it.each([
      ['an anonymous caller', null],
      ['another wrestler', caller('other-sub', 'Wrestler')],
    ])('shows %s the injury without source or note, and no stamina', (_label, viewer) => {
      const shaped = toPublicPlayer(hurt, viewer);

      expect(shaped).not.toHaveProperty('stamina');
      expect(shaped.currentInjury).toEqual(publicInjury);
    });

    it('shows the player their stamina and the public injury', () => {
      const shaped = toPublicPlayer(hurt, caller('owner-sub', 'Wrestler'));

      expect(shaped.stamina).toBe(35);
      expect(shaped.currentInjury).toEqual(publicInjury);
    });

    it.each(['Admin', 'Moderator'] as const)('shows %s everything', (role) => {
      const shaped = toPublicPlayer(hurt, caller('staff-sub', role));

      expect(shaped.stamina).toBe(35);
      expect(shaped.currentInjury).toEqual(currentInjury);
    });

    it('gives the own-player view stamina and the injury without the note', () => {
      const shaped = toOwnPlayer(hurt);

      expect(shaped.stamina).toBe(35);
      expect(shaped.currentInjury).toEqual(publicInjury);
    });
  });

  it('reports an unlinked player as such', () => {
    const unlinked: { playerId: string; userId?: string } = { playerId: 'p2' };
    const shaped = toPublicPlayer(unlinked, caller('staff-sub', 'Admin'));

    expect(shaped.hasLinkedAccount).toBe(false);
    expect(shaped).not.toHaveProperty('userId');
  });

  describe('discipline', () => {
    const issuedAt = new Date().toISOString();
    const disciplined = {
      ...player,
      strikes: [{ strikeId: 's1', issuedAt, issuedBy: 'admin-sub', issuedByName: 'Admin', reason: 'Late' }],
      deactivations: [],
      disciplineVersion: 1,
      signupGuardKey: 'rock@example.com',
    };
    const storedFields = ['strikes', 'deactivations', 'deactivatedAt', 'disciplineVersion', 'signupGuardKey'];

    it.each([
      ['an anonymous caller', null],
      ['another wrestler', caller('other-sub', 'Wrestler')],
    ])('shows %s neither the fields nor the summary', (_label, viewer) => {
      const shaped = toPublicPlayer({ ...disciplined, deactivatedAt: issuedAt }, viewer);

      for (const field of storedFields) expect(shaped).not.toHaveProperty(field);
      expect(shaped).not.toHaveProperty('discipline');
      expect(JSON.stringify(shaped)).not.toContain('Late');
    });

    it.each([
      ['the player', caller('owner-sub', 'Wrestler')],
      ['an Admin', caller('staff-sub', 'Admin')],
      ['a Moderator', caller('staff-sub', 'Moderator')],
    ])('gives %s the summary and still no stored fields', (_label, viewer) => {
      const shaped = toPublicPlayer({ ...disciplined, deactivatedAt: issuedAt }, viewer);

      for (const field of storedFields) expect(shaped).not.toHaveProperty(field);
      expect(shaped.discipline).toMatchObject({ status: 'deactivated', deactivatedAt: issuedAt, activeStrikeCount: 1 });
      expect(JSON.stringify(shaped)).not.toContain('admin-sub');
    });

    it('gives staff a clear summary for a player with no strikes', () => {
      expect(toPublicPlayer(player, caller('staff-sub', 'Admin')).discipline?.status).toBe('clear');
    });
  });
});

describe('toOwnPlayer', () => {
  it('swaps the stored fields for the summary and keeps the account fields', () => {
    const issuedAt = new Date().toISOString();
    const shaped = toOwnPlayer({
      playerId: 'p1',
      userId: 'owner-sub',
      strikes: [{ strikeId: 's1', issuedAt, issuedBy: 'admin-sub', issuedByName: 'Admin', reason: 'Late' }],
      deactivations: [],
      disciplineVersion: 1,
      signupGuardKey: 'rock@example.com',
    });

    expect(shaped).toEqual({
      playerId: 'p1',
      userId: 'owner-sub',
      discipline: expect.objectContaining({
        status: 'warned',
        activeStrikes: [{ strikeId: 's1', issuedAt, reason: 'Late' }],
      }),
    });
  });
});
