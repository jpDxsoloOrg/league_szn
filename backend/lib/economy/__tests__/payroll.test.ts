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
  type Repositories,
} from '../../repositories';
import { leagueWeekOf } from '../../leagueWeek';
import {
  PAYROLL_JOB,
  SEASON_CONTRACT_ENDED_MESSAGE,
  endSeasonContracts,
  isOwedSalary,
  runPayroll,
  salaryKey,
} from '../payroll';

// Sunday 22 Nov 2026, 00:05 in New York (EST, UTC-5).
const SUNDAY_TICK = new Date('2026-11-22T05:05:00.000Z');
const SUNDAY_LATER_TICK = new Date('2026-11-22T06:05:00.000Z');
const WEEK_KEY = '2026-11-22';
// Started before that week began.
const STARTED_LAST_WEEK = '2026-11-17T15:00:00.000Z';

let repos: Repositories;

async function makePlayer(name: string): Promise<string> {
  const player = await repos.roster.players.create({ name, currentWrestler: name });
  await repos.roster.players.update(player.playerId, { userId: `${name}-sub` });
  return player.playerId;
}

async function signContract(
  playerId: string,
  terms: { type?: ContractType; weeklySalary?: number; seasonId?: string; startedAt?: string } = {},
): Promise<Contract> {
  const type = terms.type ?? 'matches';
  const contract = await repos.contracts.create({
    playerId,
    type,
    ...(type !== 'season' && { matchesTotal: 5 }),
    ...(terms.seasonId !== undefined && { seasonId: terms.seasonId }),
    perMatchPay: 100,
    weeklySalary: terms.weeklySalary ?? 250,
    winBonus: 40,
    offeredBy: 'gm-sub',
    offeredAt: STARTED_LAST_WEEK,
    offerExpiresAt: STARTED_LAST_WEEK,
  });
  await repos.runInTransaction(async (tx) => {
    tx.updateContract(contract.contractId, { status: 'active', startedAt: terms.startedAt ?? STARTED_LAST_WEEK }, 'offered');
    tx.setPlayerActiveContract(playerId, contract.contractId);
  });
  return (await repos.contracts.findById(contract.contractId))!;
}

async function salaryEntries(playerId: string) {
  return (await repos.ledger.listForPlayer(playerId)).items.filter((entry) => entry.kind === 'salary');
}

async function balanceOf(playerId: string): Promise<number> {
  return (await repos.roster.players.findById(playerId))?.balance ?? 0;
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

describe('isOwedSalary', () => {
  const weekStart = new Date('2026-11-22T05:00:00.000Z');

  it('pays an active contract that started before the week began', () => {
    expect(isOwedSalary({ status: 'active', weeklySalary: 100, startedAt: STARTED_LAST_WEEK }, weekStart)).toBe(true);
  });

  it('waits for the next Sunday when the contract started after the week began', () => {
    expect(isOwedSalary({ status: 'active', weeklySalary: 100, startedAt: '2026-11-23T12:00:00.000Z' }, weekStart)).toBe(false);
  });

  it('pays nothing for a zero salary or an ended contract', () => {
    expect(isOwedSalary({ status: 'active', weeklySalary: 0, startedAt: STARTED_LAST_WEEK }, weekStart)).toBe(false);
    expect(isOwedSalary({ status: 'released', weeklySalary: 100, startedAt: STARTED_LAST_WEEK }, weekStart)).toBe(false);
  });
});

describe('runPayroll', () => {
  it('pays each salaried contract once per week, even with two ticks', async () => {
    const playerId = await makePlayer('Ace');
    const contract = await signContract(playerId, { weeklySalary: 250 });

    const first = await runPayroll(SUNDAY_TICK);
    const second = await runPayroll(SUNDAY_LATER_TICK);

    expect(first).toMatchObject({ status: 'paid', weekKey: WEEK_KEY, paid: [contract.contractId] });
    expect(second.status).toBe('alreadyRun');
    const entries = await salaryEntries(playerId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      amount: 250,
      idempotencyKey: salaryKey(WEEK_KEY, contract.contractId),
      refType: 'contract',
      refId: contract.contractId,
    });
    expect(await balanceOf(playerId)).toBe(250);
  });

  it('never double-pays when the week marker is lost (idempotency key)', async () => {
    const playerId = await makePlayer('Ace');
    const contract = await signContract(playerId);

    await runPayroll(SUNDAY_TICK);
    // Simulate a concurrent run that read the marker before the first one set it.
    (repos.user.siteConfig as unknown as { weeklyJobWeeks: Map<string, string> }).weeklyJobWeeks.clear();
    const retry = await runPayroll(SUNDAY_LATER_TICK);

    expect(retry.paid).toEqual([]);
    expect(retry.alreadyPaid).toEqual([contract.contractId]);
    expect(await salaryEntries(playerId)).toHaveLength(1);
  });

  it('pays again the following week', async () => {
    const playerId = await makePlayer('Ace');
    await signContract(playerId, { weeklySalary: 100 });

    await runPayroll(SUNDAY_TICK);
    await runPayroll(new Date('2026-11-29T05:30:00.000Z'));

    expect(await salaryEntries(playerId)).toHaveLength(2);
    expect(await balanceOf(playerId)).toBe(200);
  });

  it('gives a contract started mid-week the full salary on its first Sunday', async () => {
    const playerId = await makePlayer('Rookie');
    await signContract(playerId, { weeklySalary: 300, startedAt: '2026-11-24T18:00:00.000Z' });

    // Same week it started: a late catch-up tick does not pay it yet.
    const sameWeek = await runPayroll(new Date('2026-11-25T12:00:00.000Z'));
    expect(sameWeek.weekKey).toBe(WEEK_KEY);
    expect(await salaryEntries(playerId)).toHaveLength(0);

    await runPayroll(new Date('2026-11-29T05:30:00.000Z'));
    expect(await balanceOf(playerId)).toBe(300);
  });

  it('pays nothing for ended contracts or a zero salary', async () => {
    const releasedPlayer = await makePlayer('Gone');
    const released = await signContract(releasedPlayer);
    await repos.runInTransaction(async (tx) => {
      tx.updateContract(released.contractId, { status: 'released', endReason: 'released' }, 'active');
      tx.clearPlayerActiveContract(releasedPlayer, released.contractId);
    });
    const perMatchPlayer = await makePlayer('PerMatch');
    await signContract(perMatchPlayer, { type: 'tryout', weeklySalary: 0 });

    const result = await runPayroll(SUNDAY_TICK);

    expect(result.paid).toEqual([]);
    expect(await salaryEntries(releasedPlayer)).toHaveLength(0);
    expect(await salaryEntries(perMatchPlayer)).toHaveLength(0);
  });

  it('pays nothing while the economy flag is off and does not back-pay that week', async () => {
    await repos.user.siteConfig.updateFeatures({ economy: false });
    const playerId = await makePlayer('Ace');
    await signContract(playerId);

    const off = await runPayroll(SUNDAY_TICK);
    await repos.user.siteConfig.updateFeatures({ economy: true });
    const onLater = await runPayroll(SUNDAY_LATER_TICK);

    expect(off.status).toBe('economyOff');
    expect(onLater.status).toBe('alreadyRun');
    expect(await salaryEntries(playerId)).toHaveLength(0);
  });

  it('leaves the week open for a retry when a posting fails', async () => {
    const playerId = await makePlayer('Ace');
    await signContract(playerId);
    const realRun = repos.runInTransaction.bind(repos);
    const spy = vi.spyOn(repos, 'runInTransaction').mockRejectedValueOnce(new Error('throttled'));

    const failed = await runPayroll(SUNDAY_TICK);
    expect(failed.status).toBe('incomplete');
    expect(await repos.user.siteConfig.getWeeklyJobWeek(PAYROLL_JOB)).toBeNull();

    spy.mockImplementation(realRun);
    const retried = await runPayroll(SUNDAY_LATER_TICK);

    expect(retried.status).toBe('paid');
    expect(await repos.user.siteConfig.getWeeklyJobWeek(PAYROLL_JOB)).toBe(WEEK_KEY);
    expect(await salaryEntries(playerId)).toHaveLength(1);
  });

  it('ends a season contract whose season is already over instead of paying it', async () => {
    const season = await repos.season.seasons.create({ name: 'S1', startDate: '2026-09-01' });
    await repos.season.seasons.update(season.seasonId, { status: 'completed' });
    const playerId = await makePlayer('Vet');
    const contract = await signContract(playerId, { type: 'season', seasonId: season.seasonId });

    const result = await runPayroll(SUNDAY_TICK);

    expect(result.ended).toEqual([contract.contractId]);
    expect(await salaryEntries(playerId)).toHaveLength(0);
    expect((await repos.contracts.findById(contract.contractId))?.status).toBe('completed');
    expect((await repos.roster.players.findById(playerId))?.activeContractId).toBeUndefined();
  });
});

describe('endSeasonContracts', () => {
  it("completes that season's contracts only and frees the players", async () => {
    const ending = await repos.season.seasons.create({ name: 'S1', startDate: '2026-09-01' });
    const otherSeasonId = 'season-other';
    const vet = await makePlayer('Vet');
    const other = await makePlayer('Other');
    const matcher = await makePlayer('Matcher');
    const seasonContract = await signContract(vet, { type: 'season', seasonId: ending.seasonId });
    const otherSeasonContract = await signContract(other, { type: 'season', seasonId: otherSeasonId });
    const matchesContract = await signContract(matcher, { type: 'matches' });

    const result = await endSeasonContracts(ending.seasonId, new Date('2026-11-24T12:00:00.000Z'));

    expect(result).toEqual({ ended: [seasonContract.contractId], failed: 0 });
    const ended = await repos.contracts.findById(seasonContract.contractId);
    expect(ended).toMatchObject({ status: 'completed', endReason: 'seasonEnded', endedAt: '2026-11-24T12:00:00.000Z' });
    expect((await repos.roster.players.findById(vet))?.activeContractId).toBeUndefined();
    expect((await repos.contracts.findById(otherSeasonContract.contractId))?.status).toBe('active');
    expect((await repos.contracts.findById(matchesContract.contractId))?.status).toBe('active');
    expect((await repos.roster.players.findById(other))?.activeContractId).toBe(otherSeasonContract.contractId);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'Vet-sub',
      type: 'contract_completed',
      message: SEASON_CONTRACT_ENDED_MESSAGE,
      sourceId: seasonContract.contractId,
    }));
  });

  it('is a no-op the second time', async () => {
    const season = await repos.season.seasons.create({ name: 'S1', startDate: '2026-09-01' });
    const vet = await makePlayer('Vet');
    await signContract(vet, { type: 'season', seasonId: season.seasonId });

    await endSeasonContracts(season.seasonId);
    const again = await endSeasonContracts(season.seasonId);

    expect(again.ended).toEqual([]);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });
});

describe('leagueWeekOf', () => {
  it('keys a week by the local Sunday it starts on', () => {
    expect(leagueWeekOf(SUNDAY_TICK)).toMatchObject({ weekKey: WEEK_KEY, isSunday: true });
    expect(leagueWeekOf(SUNDAY_TICK).weekStart.toISOString()).toBe('2026-11-22T05:00:00.000Z');
  });

  it('Saturday 23:59 local is still the previous week', () => {
    const week = leagueWeekOf(new Date('2026-11-22T04:59:00.000Z'));
    expect(week).toMatchObject({ weekKey: '2026-11-15', isSunday: false });
  });

  it('handles the DST weekends', () => {
    // Spring forward: Sunday 8 Mar 2026 starts at 05:00Z (still EST at midnight).
    const spring = leagueWeekOf(new Date('2026-03-08T12:00:00.000Z'));
    expect(spring.weekKey).toBe('2026-03-08');
    expect(spring.weekStart.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    // The following Sunday is in EDT: midnight is 04:00Z.
    const afterSpring = leagueWeekOf(new Date('2026-03-15T04:30:00.000Z'));
    expect(afterSpring.weekKey).toBe('2026-03-15');
    expect(afterSpring.weekStart.toISOString()).toBe('2026-03-15T04:00:00.000Z');
    // Fall back: Sunday 1 Nov 2026 midnight is still EDT (04:00Z).
    const fall = leagueWeekOf(new Date('2026-11-01T20:00:00.000Z'));
    expect(fall.weekKey).toBe('2026-11-01');
    expect(fall.weekStart.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });
});
