import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryUnitOfWork } from '../InMemoryUnitOfWork';
import { ConcurrencyError, isConcurrentWriteError } from '../../errors';

type Stores = ConstructorParameters<typeof InMemoryUnitOfWork>[0];

function makeStores(): Stores {
  return {
    players: new Map(),
    tagTeams: new Map(),
    championships: new Map(),
    championshipHistory: [],
    challenges: new Map(),
    seasonStandings: [],
    matches: new Map(),
    wrestlers: new Map(),
    factionMessages: [],
    factionDirectMessages: [],
    rivalries: new Map(),
    rivalryMessages: [],
    rivalryNotes: [],
    matchRatings: new Map(),
  };
}

describe('InMemoryUnitOfWork guards', () => {
  let stores: Stores;

  beforeEach(() => {
    stores = makeStores();
    stores.players.set('p1', { playerId: 'p1', wins: 0 });
    stores.matches.set('m1', { matchId: 'm1', status: 'scheduled', updatedAt: 't0' });
    stores.wrestlers.set('w1', { wrestlerId: 'w1', isInUse: true, assignedPlayerId: 'p1' });
  });

  it('rejects a completed match and applies none of the staged work', async () => {
    stores.matches.get('m1')!.status = 'completed';
    const uow = new InMemoryUnitOfWork(stores);
    uow.incrementPlayerRecord('p1', { wins: 1 });
    uow.updateMatch('m1', 'd1', { winners: ['p1'] }, { kind: 'notCompleted' });

    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
    expect(stores.players.get('p1')!.wins).toBe(0);
  });

  it('treats a missing match as a failed guard', async () => {
    const uow = new InMemoryUnitOfWork(stores);
    uow.updateMatch('gone', 'd1', { status: 'completed' }, { kind: 'notCompleted' });
    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('passes unchangedSince on a matching updatedAt and rejects a stale one', async () => {
    const stale = new InMemoryUnitOfWork(stores);
    stale.updateMatch('m1', 'd1', { slots: [] }, { kind: 'unchangedSince', updatedAt: 'older' });
    await expect(stale.commit()).rejects.toBeInstanceOf(ConcurrencyError);

    const current = new InMemoryUnitOfWork(stores);
    current.updateMatch('m1', 'd1', { slots: [] }, { kind: 'unchangedSince', updatedAt: 't0' });
    await expect(current.commit()).resolves.toBeUndefined();
  });

  it('fails an increment for a missing player instead of skipping it', async () => {
    const uow = new InMemoryUnitOfWork(stores);
    uow.incrementPlayerRecord('gone', { wins: 1 });
    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('rejects assigning a wrestler held by another player', async () => {
    const uow = new InMemoryUnitOfWork(stores);
    uow.assignWrestlerToPlayer({ wrestlerId: 'w1', playerId: 'p2', slot: 'primary' });
    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
    expect(stores.wrestlers.get('w1')!.assignedPlayerId).toBe('p1');
  });

  it('allows the current holder to re-assign', async () => {
    const uow = new InMemoryUnitOfWork(stores);
    uow.assignWrestlerToPlayer({ wrestlerId: 'w1', playerId: 'p1', slot: 'alternate' });
    await expect(uow.commit()).resolves.toBeUndefined();
    expect(stores.wrestlers.get('w1')!.assignedSlot).toBe('alternate');
  });

  it('checks the owner on release only when asked to', async () => {
    const wrongOwner = new InMemoryUnitOfWork(stores);
    wrongOwner.releaseWrestlerFromPlayer({ wrestlerId: 'w1', expectedPlayerId: 'p2' });
    await expect(wrongOwner.commit()).rejects.toBeInstanceOf(ConcurrencyError);

    const anyOwner = new InMemoryUnitOfWork(stores);
    anyOwner.releaseWrestlerFromPlayer({ wrestlerId: 'w1' });
    await expect(anyOwner.commit()).resolves.toBeUndefined();
    expect(stores.wrestlers.get('w1')!.isInUse).toBe(false);
  });
});

describe('isConcurrentWriteError', () => {
  it('recognises guard failures and cancelled transactions only', () => {
    const cancelled = new Error('x');
    cancelled.name = 'TransactionCanceledException';
    expect(isConcurrentWriteError(new ConcurrencyError('Match', 'm1'))).toBe(true);
    expect(isConcurrentWriteError(cancelled)).toBe(true);
    expect(isConcurrentWriteError(new Error('boom'))).toBe(false);
    expect(isConcurrentWriteError(null)).toBe(false);
  });
});
