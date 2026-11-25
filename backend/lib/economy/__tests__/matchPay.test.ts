import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
const { mockCreateNotification } = vi.hoisted(() => ({ mockCreateNotification: vi.fn() }));
vi.mock('../../notifications', () => ({ createNotification: mockCreateNotification }));

import { buildInMemoryRepositories } from '../../repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Contract,
  type ContractType,
  type Match,
  type Repositories,
} from '../../repositories';
import { DEFAULT_ECONOMY_SETTINGS } from '../../policies/economyDefaults';
import {
  CONTRACT_COMPLETED_MESSAGE,
  matchPayKey,
  matchWinBonusKey,
  planPlayerPay,
  reverseMatchPay,
  settleMatchPay,
} from '../matchPay';

const FREE_AGENT_BONUS = DEFAULT_ECONOMY_SETTINGS.freeAgentWinBonus;

let repos: Repositories;
let matchCounter = 0;

async function makePlayer(name: string): Promise<string> {
  const player = await repos.roster.players.create({ name, currentWrestler: name });
  await repos.roster.players.update(player.playerId, { userId: `${name}-sub` });
  return player.playerId;
}

async function signContract(
  playerId: string,
  terms: { type?: ContractType; matchesTotal?: number; perMatchPay?: number; winBonus?: number } = {},
): Promise<Contract> {
  const now = new Date().toISOString();
  const contract = await repos.contracts.create({
    playerId,
    type: terms.type ?? 'matches',
    ...(terms.type !== 'season' && { matchesTotal: terms.matchesTotal ?? 5 }),
    perMatchPay: terms.perMatchPay ?? 100,
    weeklySalary: 0,
    winBonus: terms.winBonus ?? 40,
    offeredBy: 'gm-sub',
    offeredAt: now,
    offerExpiresAt: now,
  });
  await repos.runInTransaction(async (tx) => {
    tx.updateContract(contract.contractId, { status: 'active', startedAt: now }, 'offered');
    tx.setPlayerActiveContract(playerId, contract.contractId);
  });
  return (await repos.contracts.findById(contract.contractId))!;
}

async function completedMatch(
  winners: string[],
  losers: string[],
  extra: Partial<Match> & Record<string, unknown> = {},
): Promise<string> {
  matchCounter += 1;
  const matchId = `match-${matchCounter}`;
  await repos.competition.matches.create({
    matchId,
    date: '2026-11-20T20:00:00.000Z',
    participants: [...winners, ...losers],
    winners,
    losers,
    status: 'completed',
    completedAt: '2026-11-20T21:00:00.000Z',
    createdAt: '2026-11-20T19:00:00.000Z',
    updatedAt: '2026-11-20T21:00:00.000Z',
    ...extra,
  });
  return matchId;
}

async function balanceOf(playerId: string): Promise<number> {
  return (await repos.roster.players.findById(playerId))?.balance ?? 0;
}

async function entriesOf(playerId: string) {
  return (await repos.ledger.listForPlayer(playerId)).items;
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await repos.user.siteConfig.updateFeatures({ economy: true });
  mockCreateNotification.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('planPlayerPay', () => {
  const contract = {
    contractId: 'c1', type: 'matches' as const, status: 'active' as const,
    matchesPlayed: 0, matchesTotal: 3, perMatchPay: 0, winBonus: 0,
  };

  it('posts nothing for zero amounts but still counts the match', () => {
    const plan = planPlayerPay({
      matchId: 'm', playerId: 'p', isWinner: true, isDraw: false, contract,
      settings: { freeAgentWinBonus: 50 },
    });
    expect(plan.postings).toEqual([]);
    expect(plan.contractCount).toEqual({ contractId: 'c1', expectedMatchesPlayed: 0, matchesPlayed: 1, completed: false });
  });

  it('gives no bonus on a draw', () => {
    const plan = planPlayerPay({
      matchId: 'm', playerId: 'p', isWinner: true, isDraw: true, settings: { freeAgentWinBonus: 50 },
    });
    expect(plan.postings).toEqual([]);
    expect(plan.contractCount).toBeUndefined();
  });
});

describe('settleMatchPay', () => {
  it('pays a contracted winner per-match pay plus the contract win bonus', async () => {
    const winner = await makePlayer('rock');
    const loser = await makePlayer('austin');
    const winnerContract = await signContract(winner, { perMatchPay: 100, winBonus: 40 });
    const loserContract = await signContract(loser, { perMatchPay: 70, winBonus: 40 });
    const matchId = await completedMatch([winner], [loser]);

    const outcome = await settleMatchPay(matchId);

    expect(outcome.status).toBe('settled');
    expect(await balanceOf(winner)).toBe(140);
    const winnerEntries = await entriesOf(winner);
    expect(winnerEntries.map((entry) => [entry.kind, entry.amount, entry.idempotencyKey]).sort()).toEqual([
      ['perMatchPay', 100, matchPayKey(matchId, winner)],
      ['winBonus', 40, matchWinBonusKey(matchId, winner)],
    ]);
    expect(winnerEntries[0]).toMatchObject({ refType: 'match', refId: matchId });

    // A loser gets the per-match pay only.
    expect(await balanceOf(loser)).toBe(70);
    expect((await entriesOf(loser)).map((entry) => entry.kind)).toEqual(['perMatchPay']);

    expect((await repos.contracts.findById(winnerContract.contractId))?.matchesPlayed).toBe(1);
    expect((await repos.contracts.findById(loserContract.contractId))?.matchesPlayed).toBe(1);
    const match = await repos.competition.matches.findById(matchId);
    expect(match?.paySettlement?.players).toEqual({
      [winner]: { contractId: winnerContract.contractId },
      [loser]: { contractId: loserContract.contractId },
    });
  });

  it('gives a free-agent winner only the free-agent win bonus and a free-agent loser nothing', async () => {
    const winner = await makePlayer('rock');
    const loser = await makePlayer('austin');
    const matchId = await completedMatch([winner], [loser]);

    await settleMatchPay(matchId);

    expect(await entriesOf(winner)).toEqual([
      expect.objectContaining({ kind: 'winBonus', amount: FREE_AGENT_BONUS }),
    ]);
    expect(await balanceOf(loser)).toBe(0);
    expect(await entriesOf(loser)).toEqual([]);
  });

  it('pays no win bonus on a draw', async () => {
    const first = await makePlayer('rock');
    const second = await makePlayer('austin');
    await signContract(first, { perMatchPay: 100, winBonus: 40 });
    const matchId = await completedMatch([first, second], [], { isDraw: true });

    await settleMatchPay(matchId);

    expect(await balanceOf(first)).toBe(100);
    expect(await balanceOf(second)).toBe(0);
  });

  it('never pays or counts twice when settled again', async () => {
    const winner = await makePlayer('rock');
    const loser = await makePlayer('austin');
    const contract = await signContract(winner, { perMatchPay: 100, winBonus: 40 });
    const matchId = await completedMatch([winner], [loser]);

    await settleMatchPay(matchId);
    const again = await settleMatchPay(matchId);

    expect(again.settledPlayerIds).toEqual([]);
    expect(await balanceOf(winner)).toBe(140);
    expect(await entriesOf(winner)).toHaveLength(2);
    expect((await repos.contracts.findById(contract.contractId))?.matchesPlayed).toBe(1);
  });

  it('pays a no-show nothing and does not count the match for them', async () => {
    const winner = await makePlayer('rock');
    const noShow = await makePlayer('austin');
    const contract = await signContract(noShow, { perMatchPay: 100 });
    const matchId = await completedMatch([winner], [noShow], {
      noShows: [{ playerId: noShow, markedAt: '2026-11-20T20:30:00.000Z' }],
    });

    await settleMatchPay(matchId);

    expect(await entriesOf(noShow)).toEqual([]);
    expect((await repos.contracts.findById(contract.contractId))?.matchesPlayed).toBe(0);
    expect(await balanceOf(winner)).toBe(FREE_AGENT_BONUS);
  });

  it('pays a player whose no-show mark was undone', async () => {
    const winner = await makePlayer('rock');
    const loser = await makePlayer('austin');
    await signContract(loser, { perMatchPay: 100 });
    const matchId = await completedMatch([winner], [loser], {
      noShows: [{ playerId: loser, markedAt: '2026-11-20T20:30:00.000Z', undoneAt: '2026-11-20T20:40:00.000Z' }],
    });

    await settleMatchPay(matchId);

    expect(await balanceOf(loser)).toBe(100);
  });

  it('does nothing while the economy flag is off', async () => {
    await repos.user.siteConfig.updateFeatures({ economy: false });
    const winner = await makePlayer('rock');
    const loser = await makePlayer('austin');
    const contract = await signContract(winner);
    const matchId = await completedMatch([winner], [loser]);

    const outcome = await settleMatchPay(matchId);

    expect(outcome.status).toBe('economyOff');
    expect(await entriesOf(winner)).toEqual([]);
    expect((await repos.contracts.findById(contract.contractId))?.matchesPlayed).toBe(0);
    expect((await repos.competition.matches.findById(matchId))?.paySettlement).toBeUndefined();
  });

  it('completes a tryout on its third match and makes the player a free agent', async () => {
    const player = await makePlayer('rock');
    const opponent = await makePlayer('austin');
    const tryout = await signContract(player, { type: 'tryout', matchesTotal: 3, perMatchPay: 50, winBonus: 10 });

    for (let played = 1; played <= 2; played++) {
      await settleMatchPay(await completedMatch([player], [opponent]));
      const contract = await repos.contracts.findById(tryout.contractId);
      expect(contract).toMatchObject({ status: 'active', matchesPlayed: played });
    }
    expect(mockCreateNotification).not.toHaveBeenCalled();

    const thirdMatch = await completedMatch([player], [opponent]);
    const outcome = await settleMatchPay(thirdMatch);

    expect(outcome.completedContractIds).toEqual([tryout.contractId]);
    expect(await repos.contracts.findById(tryout.contractId)).toMatchObject({
      status: 'completed',
      matchesPlayed: 3,
      endReason: 'matchesCompleted',
    });
    expect((await repos.roster.players.findById(player))?.activeContractId).toBeUndefined();
    expect(await balanceOf(player)).toBe(3 * (50 + 10));
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: 'rock-sub',
      type: 'contract_completed',
      message: CONTRACT_COMPLETED_MESSAGE,
      sourceId: tryout.contractId,
      sourceType: 'contract',
    });

    // The next win pays the free-agent bonus only.
    await settleMatchPay(await completedMatch([player], [opponent]));
    expect(await balanceOf(player)).toBe(3 * 60 + FREE_AGENT_BONUS);
  });

  it('leaves a season contract running', async () => {
    const player = await makePlayer('rock');
    const opponent = await makePlayer('austin');
    const contract = await signContract(player, { type: 'season', perMatchPay: 10 });

    await settleMatchPay(await completedMatch([player], [opponent]));

    expect(await repos.contracts.findById(contract.contractId)).toMatchObject({ status: 'active', matchesPlayed: 1 });
  });

  it('skips a match that is not completed', async () => {
    vi.useFakeTimers();
    try {
      const winner = await makePlayer('rock');
      const matchId = await completedMatch([winner], [], { status: 'scheduled' });
      const pending = settleMatchPay(matchId);
      await vi.runAllTimersAsync();
      expect((await pending).status).toBe('notCompleted');
      expect(await entriesOf(winner)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('reverseMatchPay', () => {
  it('reverses the pay and rolls the contract count back, once', async () => {
    const winner = await makePlayer('rock');
    const loser = await makePlayer('austin');
    const contract = await signContract(winner, { perMatchPay: 100, winBonus: 40 });
    const matchId = await completedMatch([winner], [loser]);
    await settleMatchPay(matchId);

    const outcome = await reverseMatchPay(matchId);
    await reverseMatchPay(matchId);

    expect(outcome.reversedPlayerIds.sort()).toEqual([winner, loser].sort());
    expect(await balanceOf(winner)).toBe(0);
    expect(await balanceOf(loser)).toBe(0);
    const reversals = (await entriesOf(winner)).filter((entry) => entry.kind === 'reversal');
    expect(reversals.map((entry) => entry.amount).sort((a, b) => a - b)).toEqual([-100, -40]);
    // The free-agent loser was paid nothing, so there is nothing to reverse.
    expect(await entriesOf(loser)).toEqual([]);
    expect((await repos.contracts.findById(contract.contractId))?.matchesPlayed).toBe(0);
  });

  it('reopens a contract that the reverted match had completed', async () => {
    const player = await makePlayer('rock');
    const opponent = await makePlayer('austin');
    const tryout = await signContract(player, { type: 'tryout', matchesTotal: 1, perMatchPay: 50 });
    const matchId = await completedMatch([player], [opponent]);
    await settleMatchPay(matchId);
    expect((await repos.contracts.findById(tryout.contractId))?.status).toBe('completed');

    const outcome = await reverseMatchPay(matchId);

    expect(outcome.reopenedContractIds).toEqual([tryout.contractId]);
    const reopened = await repos.contracts.findById(tryout.contractId);
    expect(reopened).toMatchObject({ status: 'active', matchesPlayed: 0 });
    expect(reopened?.endedAt).toBeUndefined();
    expect(reopened?.endReason).toBeUndefined();
    expect((await repos.roster.players.findById(player))?.activeContractId).toBe(tryout.contractId);
  });

  it('leaves the contract completed when the player has signed another since', async () => {
    const player = await makePlayer('rock');
    const opponent = await makePlayer('austin');
    const tryout = await signContract(player, { type: 'tryout', matchesTotal: 1, perMatchPay: 50 });
    const matchId = await completedMatch([player], [opponent]);
    await settleMatchPay(matchId);
    const next = await signContract(player, { perMatchPay: 80 });

    const outcome = await reverseMatchPay(matchId);

    expect(outcome.reopenedContractIds).toEqual([]);
    expect(await repos.contracts.findById(tryout.contractId)).toMatchObject({ status: 'completed', matchesPlayed: 0 });
    expect((await repos.roster.players.findById(player))?.activeContractId).toBe(next.contractId);
  });

  it('does nothing for a match that was never settled', async () => {
    await repos.user.siteConfig.updateFeatures({ economy: false });
    const winner = await makePlayer('rock');
    const matchId = await completedMatch([winner], []);
    await settleMatchPay(matchId);

    expect(await reverseMatchPay(matchId)).toEqual({ reversedPlayerIds: [], reopenedContractIds: [] });
  });
});
