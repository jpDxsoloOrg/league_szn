import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

import { buildInMemoryRepositories } from '../index';
import type { Repositories } from '../../registry';
import { ConcurrencyError } from '../../errors';
import { InvalidLedgerPostingError } from '../../ledger';
import { InvalidInjuryWriteError, toCurrentInjury, type Injury } from '../../injuries';

let repos: Repositories;
let playerId: string;

const injuryFor = (overrides: Partial<Injury> = {}): Injury => ({
  playerId,
  startedAt: '2026-11-24T20:00:00.000Z',
  injuryId: 'inj-1',
  source: 'match',
  severity: 'moderate',
  weeks: 2,
  returnsAt: '2026-12-06T05:00:00.000Z',
  matchId: 'm1',
  changes: [],
  ...overrides,
});

const player = async () => (await repos.roster.players.findById(playerId))!;

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  playerId = (await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' })).playerId;
});

// INJ-03
describe('in-memory stamina and injuries', () => {
  it('records the result, drain and new injury in one unit of work', async () => {
    const injury = injuryFor();
    await repos.runInTransaction(async (tx) => {
      tx.incrementPlayerRecord(playerId, { losses: 1 });
      tx.updatePlayerCondition(playerId, { stamina: 45, currentInjury: toCurrentInjury(injury) });
      tx.putInjury(injury);
    });

    const stored = await player();
    expect(stored.losses).toBe(1);
    expect(stored.stamina).toBe(45);
    expect(stored.currentInjury).toEqual(toCurrentInjury(injury));
    expect(await repos.injuries.get(playerId, injury.startedAt)).toEqual(injury);
  });

  it('lists a player newest first, finds by id, and lists open injuries soonest return first', async () => {
    const otherId = (await repos.roster.players.create({ name: 'Cena', currentWrestler: 'John Cena' })).playerId;
    const old = injuryFor({
      injuryId: 'old',
      startedAt: '2026-10-01T00:00:00.000Z',
      returnsAt: '2026-10-11T04:00:00.000Z',
      endedAt: '2026-10-11T04:00:00.000Z',
      endedReason: 'recovered',
    });
    const open = injuryFor({ injuryId: 'open', returnsAt: '2026-12-20T05:00:00.000Z' });
    const otherOpen = injuryFor({ playerId: otherId, injuryId: 'other', returnsAt: '2026-12-06T05:00:00.000Z' });
    await repos.runInTransaction(async (tx) => {
      tx.putInjury(old);
      tx.putInjury(open);
      tx.putInjury(otherOpen);
    });

    expect((await repos.injuries.listByPlayer(playerId)).map((row) => row.injuryId)).toEqual(['open', 'old']);
    expect((await repos.injuries.findByInjuryId(playerId, 'old'))?.endedReason).toBe('recovered');
    expect(await repos.injuries.findByInjuryId(playerId, 'other')).toBeNull();
    expect((await repos.injuries.listOpen()).map((row) => row.injuryId)).toEqual(['other', 'open']);
  });

  it('refuses a second row with the same key', async () => {
    await repos.runInTransaction(async (tx) => tx.putInjury(injuryFor()));
    await expect(repos.runInTransaction(async (tx) => tx.putInjury(injuryFor({ injuryId: 'dup' }))))
      .rejects.toThrow(ConcurrencyError);
  });

  it('heals: ends the row, logs the change and clears the player copy', async () => {
    const injury = injuryFor();
    await repos.runInTransaction(async (tx) => {
      tx.putInjury(injury);
      tx.updatePlayerCondition(playerId, { currentInjury: toCurrentInjury(injury) });
    });

    await repos.runInTransaction(async (tx) => {
      tx.updateInjury(playerId, injury.startedAt, {
        endedAt: '2026-11-26T00:00:00.000Z',
        endedReason: 'healedByGm',
        appendChanges: [{ kind: 'healed', at: '2026-11-26T00:00:00.000Z', by: 'gm-sub', note: 'Miracle' }],
      });
      tx.updatePlayerCondition(playerId, { currentInjury: null }, { currentInjuryId: injury.injuryId });
    });

    const row = (await repos.injuries.get(playerId, injury.startedAt))!;
    expect(row).toMatchObject({ endedReason: 'healedByGm', endedAt: '2026-11-26T00:00:00.000Z' });
    expect(row.changes).toEqual([{ kind: 'healed', at: '2026-11-26T00:00:00.000Z', by: 'gm-sub', note: 'Miracle' }]);
    expect((await player()).currentInjury).toBeUndefined();

    // Ending it again (a racing heal or the weekly job) fails the whole unit of work.
    await expect(repos.runInTransaction(async (tx) => {
      tx.updateInjury(playerId, injury.startedAt, { endedAt: '2026-11-30T05:00:00.000Z', endedReason: 'recovered' });
    })).rejects.toThrow(ConcurrencyError);
  });

  it('fails the guard when the stored values moved on, writing nothing', async () => {
    await repos.runInTransaction(async (tx) => tx.updatePlayerCondition(playerId, { stamina: 60 }));

    await expect(repos.runInTransaction(async (tx) => {
      tx.putInjury(injuryFor());
      tx.updatePlayerCondition(playerId, { stamina: 40 }, { stamina: 80 });
    })).rejects.toThrow(new ConcurrencyError('Player', playerId));
    expect((await player()).stamina).toBe(60);
    expect(await repos.injuries.listByPlayer(playerId)).toEqual([]);

    await expect(repos.runInTransaction(async (tx) => {
      tx.updatePlayerCondition(playerId, { stamina: 40 }, { currentInjuryId: 'inj-1' });
    })).rejects.toThrow(ConcurrencyError);

    await repos.runInTransaction(async (tx) => {
      tx.updatePlayerCondition(playerId, { stamina: 40 }, { stamina: 60, currentInjuryId: null });
    });
    expect((await player()).stamina).toBe(40);
  });

  it('refuses a condition write for a deleted player', async () => {
    await repos.roster.players.delete(playerId);
    await expect(repos.runInTransaction(async (tx) => tx.updatePlayerCondition(playerId, { stamina: 50 })))
      .rejects.toThrow(ConcurrencyError);
  });

  it('refuses a condition write next to another player write or a ledger posting', async () => {
    await expect(repos.runInTransaction(async (tx) => {
      tx.updatePlayer(playerId, { name: 'Dwayne' });
      tx.updatePlayerCondition(playerId, { stamina: 50 });
    })).rejects.toThrow(InvalidInjuryWriteError);

    await expect(repos.runInTransaction(async (tx) => {
      tx.updatePlayerCondition(playerId, { stamina: 50 });
      tx.postLedgerEntry({ playerId, kind: 'perMatchPay', amount: 100, idempotencyKey: 'pay-1' });
    })).rejects.toThrow(InvalidLedgerPostingError);

    expect((await player()).stamina).toBeUndefined();
  });
});
