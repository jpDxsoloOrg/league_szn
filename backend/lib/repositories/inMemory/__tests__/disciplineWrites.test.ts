import { describe, it, expect, beforeEach } from 'vitest';
import { ConcurrencyError } from '../../errors';
import { InMemoryRosterRepository } from '../InMemoryRosterRepository';
import { InMemoryUserRepository } from '../InMemoryUserRepository';

describe('InMemoryRosterRepository players.updateDiscipline', () => {
  const patch = { strikes: [], deactivations: [], deactivatedAt: null };
  let roster: InMemoryRosterRepository;
  let playerId: string;

  beforeEach(async () => {
    roster = new InMemoryRosterRepository();
    ({ playerId } = await roster.players.create({ name: 'Rock', currentWrestler: 'X' }));
  });

  it('treats an absent version as 0 and bumps it', async () => {
    expect((await roster.players.updateDiscipline(playerId, patch, 0)).disciplineVersion).toBe(1);
    expect((await roster.players.updateDiscipline(playerId, patch, 1)).disciplineVersion).toBe(2);
  });

  it('refuses a stale version and writes nothing', async () => {
    await roster.players.updateDiscipline(playerId, patch, 0);

    await expect(roster.players.updateDiscipline(playerId, { ...patch, deactivatedAt: 'x' }, 0))
      .rejects.toBeInstanceOf(ConcurrencyError);
    expect((await roster.players.findById(playerId))?.deactivatedAt).toBeUndefined();
  });

  it('refuses a version ahead of an absent one', async () => {
    await expect(roster.players.updateDiscipline(playerId, patch, 3)).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('refuses a missing or soft-deleted player', async () => {
    await expect(roster.players.updateDiscipline('nobody', patch, 0)).rejects.toBeInstanceOf(ConcurrencyError);

    const row = roster.playersStore.get(playerId)!;
    roster.playersStore.set(playerId, { ...row, deletedAt: 'x' });
    await expect(roster.players.updateDiscipline(playerId, patch, 0)).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('removes deactivatedAt on null and keeps signupGuardKey when omitted', async () => {
    await roster.players.updateDiscipline(playerId, { ...patch, deactivatedAt: 'x', signupGuardKey: 'a@b.c' }, 0);

    const updated = await roster.players.updateDiscipline(playerId, patch, 1);

    expect(updated).not.toHaveProperty('deactivatedAt');
    expect(updated.signupGuardKey).toBe('a@b.c');
  });
});

describe('InMemoryUserRepository challenges.updateIfStatus', () => {
  let user: InMemoryUserRepository;
  let challengeId: string;

  beforeEach(async () => {
    user = new InMemoryUserRepository();
    ({ challengeId } = await user.challenges.create({
      challengerId: 'a',
      challengedId: 'b',
      matchType: 'singles',
      expiresAt: '2030-01-01T00:00:00.000Z',
    }));
  });

  it('writes while the status matches', async () => {
    expect(await user.challenges.updateIfStatus(challengeId, { status: 'cancelled' }, 'pending')).toBe(true);
    expect((await user.challenges.findById(challengeId))?.status).toBe('cancelled');
  });

  it('resolves false and writes nothing once it moved on', async () => {
    await user.challenges.update(challengeId, { status: 'accepted' });

    expect(await user.challenges.updateIfStatus(challengeId, { status: 'cancelled' }, 'pending')).toBe(false);
    expect((await user.challenges.findById(challengeId))?.status).toBe('accepted');
  });

  it('resolves false for a missing challenge', async () => {
    expect(await user.challenges.updateIfStatus('nope', { status: 'cancelled' }, 'pending')).toBe(false);
  });
});
