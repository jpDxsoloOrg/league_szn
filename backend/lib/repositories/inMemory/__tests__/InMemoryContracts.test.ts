import { describe, it, expect, beforeEach } from 'vitest';
import { buildInMemoryRepositories } from '../index';
import { buildContract, type ContractCreateInput } from '../../contracts';
import { ConcurrencyError, NotFoundError } from '../../errors';
import type { Repositories } from '../../registry';
import type { Player } from '../../types';

const offerInput = (overrides: Partial<ContractCreateInput> = {}): ContractCreateInput => ({
  playerId: 'p1',
  type: 'tryout',
  matchesTotal: 3,
  perMatchPay: 100,
  weeklySalary: 0,
  winBonus: 50,
  offeredBy: 'gm-1',
  offeredAt: '2026-11-20T10:00:00.000Z',
  offerExpiresAt: '2026-11-23T10:00:00.000Z',
  ...overrides,
});

describe('InMemoryContractsRepository', () => {
  let repos: Repositories;

  beforeEach(() => {
    repos = buildInMemoryRepositories();
  });

  it('creates an offer with status offered and no matches played', async () => {
    const contract = await repos.contracts.create(offerInput());
    expect(contract).toMatchObject({
      playerId: 'p1',
      type: 'tryout',
      status: 'offered',
      matchesTotal: 3,
      matchesPlayed: 0,
      createdAt: '2026-11-20T10:00:00.000Z',
    });
    expect(contract.seasonId).toBeUndefined();
    expect(await repos.contracts.findById(contract.contractId)).toEqual(contract);
  });

  it('lists a player\'s contracts newest first and filters the full list', async () => {
    const older = await repos.contracts.create(offerInput({ offeredAt: '2026-11-01T00:00:00.000Z' }));
    const newer = await repos.contracts.create(offerInput({ offeredAt: '2026-11-10T00:00:00.000Z' }));
    const season = await repos.contracts.create(offerInput({
      playerId: 'p2', type: 'season', matchesTotal: undefined, seasonId: 's1',
    }));

    expect((await repos.contracts.listByPlayer('p1')).map((c) => c.contractId))
      .toEqual([newer.contractId, older.contractId]);
    expect((await repos.contracts.list({ seasonId: 's1' })).map((c) => c.contractId)).toEqual([season.contractId]);
    expect(await repos.contracts.list({ status: 'active' })).toEqual([]);
    expect(await repos.contracts.list()).toHaveLength(3);
  });

  it('updates under an expected status and removes null fields', async () => {
    const contract = await repos.contracts.create(offerInput({ note: 'welcome' }));
    const active = await repos.contracts.update(
      contract.contractId,
      { status: 'active', startedAt: '2026-11-21T00:00:00.000Z', note: null },
      'offered',
    );
    expect(active.status).toBe('active');
    expect(active.startedAt).toBe('2026-11-21T00:00:00.000Z');
    expect('note' in active).toBe(false);

    await expect(repos.contracts.update(contract.contractId, { status: 'declined' }, 'offered'))
      .rejects.toBeInstanceOf(ConcurrencyError);
    await expect(repos.contracts.update('missing', { status: 'active' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('contract unit-of-work operations (in memory)', () => {
  let repos: Repositories;
  const playersStore = (): Map<string, Player> =>
    (repos.roster as unknown as { playersStore: Map<string, Player> }).playersStore;

  beforeEach(() => {
    repos = buildInMemoryRepositories();
    playersStore().set('p1', {
      playerId: 'p1', name: 'P1', currentWrestler: 'W', wins: 0, losses: 0, draws: 0,
      createdAt: 't0', updatedAt: 't0',
    });
  });

  it('accepts an offer: contract active, player linked, other offer withdrawn', async () => {
    const accepted = await repos.contracts.create(offerInput());
    const other = await repos.contracts.create(offerInput({ type: 'matches', matchesTotal: 10 }));

    await repos.runInTransaction(async (tx) => {
      tx.updateContract(accepted.contractId, { status: 'active', startedAt: 't1' }, 'offered');
      tx.setPlayerActiveContract('p1', accepted.contractId);
      tx.updateContract(other.contractId, { status: 'withdrawn', endedAt: 't1', endReason: 'otherOfferAccepted' }, 'offered');
    });

    expect((await repos.contracts.findById(accepted.contractId))?.status).toBe('active');
    expect((await repos.contracts.findById(other.contractId))?.endReason).toBe('otherOfferAccepted');
    expect(playersStore().get('p1')?.activeContractId).toBe(accepted.contractId);
  });

  it('refuses a second active contract and applies nothing', async () => {
    playersStore().get('p1')!.activeContractId = 'existing';
    const offer = await repos.contracts.create(offerInput());

    await expect(repos.runInTransaction(async (tx) => {
      tx.updateContract(offer.contractId, { status: 'active' }, 'offered');
      tx.setPlayerActiveContract('p1', offer.contractId);
    })).rejects.toBeInstanceOf(ConcurrencyError);

    expect((await repos.contracts.findById(offer.contractId))?.status).toBe('offered');
    expect(playersStore().get('p1')?.activeContractId).toBe('existing');
  });

  it('clears the active contract only when it still matches', async () => {
    playersStore().get('p1')!.activeContractId = 'c1';

    await expect(repos.runInTransaction(async (tx) => {
      tx.clearPlayerActiveContract('p1', 'other');
    })).rejects.toBeInstanceOf(ConcurrencyError);

    await repos.runInTransaction(async (tx) => {
      tx.clearPlayerActiveContract('p1', 'c1');
    });
    expect('activeContractId' in playersStore().get('p1')!).toBe(false);
  });

  it('creates a contract in a transaction and refuses a duplicate id', async () => {
    const contract = buildContract('fixed-id', offerInput(), 't0');
    await repos.runInTransaction(async (tx) => {
      tx.createContract(contract);
    });
    expect((await repos.contracts.findById('fixed-id'))?.status).toBe('offered');

    await expect(repos.runInTransaction(async (tx) => {
      tx.createContract(contract);
    })).rejects.toBeInstanceOf(ConcurrencyError);
  });
});
