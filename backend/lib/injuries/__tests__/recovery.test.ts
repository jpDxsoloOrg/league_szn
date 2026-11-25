import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
const { mockCreateNotification } = vi.hoisted(() => ({ mockCreateNotification: vi.fn() }));
vi.mock('../../notifications', () => ({ createNotification: mockCreateNotification }));

import { buildInMemoryRepositories } from '../../repositories/inMemory';
import {
  setRepositoriesForTesting,
  toCurrentInjury,
  type Injury,
  type Repositories,
} from '../../repositories';
import { leagueWeekOf } from '../../leagueWeek';
import { toInjuryTunablesInput } from '../../policies/fatigueDefaults';
import { CLEARED_TO_COMPETE_MESSAGE, RECOVERY_JOB, runRecovery } from '../recovery';

const ZONE = 'America/New_York';
// Saturday 21 Nov 2026, 23:59 in New York (EST, UTC-5).
const SATURDAY_2359 = new Date('2026-11-22T04:59:00.000Z');
// Sunday 22 Nov 2026, 00:05 and 01:05 in New York.
const SUNDAY_0005 = new Date('2026-11-22T05:05:00.000Z');
const SUNDAY_0105 = new Date('2026-11-22T06:05:00.000Z');
// The Sunday boundary injuries return at.
const SUNDAY_BOUNDARY = '2026-11-22T05:00:00.000Z';
const NEXT_SUNDAY_BOUNDARY = '2026-11-29T05:00:00.000Z';

let repos: Repositories;

const weekOf = (now: Date) => leagueWeekOf(now, ZONE);
const run = (now: Date) => runRecovery(now, weekOf(now));
async function setWeeklyRecovery(weeklyRecovery: number): Promise<void> {
  const current = await repos.user.siteConfig.getInjuryTunables();
  await repos.user.siteConfig.saveInjuryTunables({ ...toInjuryTunablesInput(current), weeklyRecovery }, 'gm-sub');
}

const playerById = async (playerId: string) => (await repos.roster.players.findById(playerId))!;

async function makePlayer(name: string, stamina?: number): Promise<string> {
  const { playerId } = await repos.roster.players.create({ name, currentWrestler: name });
  await repos.roster.players.update(playerId, { userId: `${name}-sub` });
  if (stamina !== undefined) {
    await repos.runInTransaction(async (tx) => {
      tx.updatePlayerCondition(playerId, { stamina });
    });
  }
  return playerId;
}

async function injure(playerId: string, injuryId: string, returnsAt: string): Promise<Injury> {
  const injury: Injury = {
    playerId,
    startedAt: '2026-11-10T20:00:00.000Z',
    injuryId,
    source: 'match',
    severity: 'moderate',
    weeks: 2,
    returnsAt,
    matchId: 'm1',
    changes: [],
  };
  await repos.runInTransaction(async (tx) => {
    tx.putInjury(injury);
    tx.updatePlayerCondition(playerId, { currentInjury: toCurrentInjury(injury) });
  });
  return injury;
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await repos.user.siteConfig.updateFeatures({ injuries: true });
  mockCreateNotification.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// INJ-05
describe('runRecovery', () => {
  it('does nothing on Saturday 23:59 when this week already ran', async () => {
    const tired = await makePlayer('tired', 30);
    // Saturday belongs to the week of Sunday 15 Nov, which ran last Sunday.
    await repos.user.siteConfig.markWeeklyJobWeek(RECOVERY_JOB, weekOf(SATURDAY_2359).weekKey);

    const result = await run(SATURDAY_2359);

    expect(result.status).toBe('alreadyRun');
    expect((await playerById(tired)).stamina).toBe(30);
  });

  it('recovers once on Sunday 00:05 and does nothing on a second tick the same Sunday', async () => {
    await repos.user.siteConfig.markWeeklyJobWeek(RECOVERY_JOB, '2026-11-15');
    const tired = await makePlayer('tired', 30);

    const first = await run(SUNDAY_0005);
    const second = await run(SUNDAY_0105);

    expect(first).toMatchObject({ status: 'recovered', weekKey: '2026-11-22', staminaRecovered: 1, failed: 0 });
    expect(second.status).toBe('alreadyRun');
    expect((await playerById(tired)).stamina).toBe(100);
    expect(await repos.user.siteConfig.getWeeklyJobWeek(RECOVERY_JOB)).toBe('2026-11-22');
  });

  it('adds +N capped at max when weekly recovery is a number, only once a week', async () => {
    await setWeeklyRecovery(30);
    const tired = await makePlayer('tired', 50);
    const nearlyFull = await makePlayer('nearly', 90);
    const fresh = await makePlayer('fresh');

    const result = await run(SUNDAY_0005);
    await run(SUNDAY_0105);

    expect(result.staminaRecovered).toBe(2);
    expect((await playerById(tired)).stamina).toBe(80);
    expect((await playerById(nearlyFull)).stamina).toBe(100);
    // Missing stamina means full: nothing is written.
    expect((await playerById(fresh)).stamina).toBeUndefined();
  });

  it('ends injuries returning that Sunday, clears them, notifies; future ones stay', async () => {
    const healed = await makePlayer('healed', 40);
    const stillOut = await makePlayer('stillOut', 40);
    const due = await injure(healed, 'inj-due', SUNDAY_BOUNDARY);
    const future = await injure(stillOut, 'inj-future', NEXT_SUNDAY_BOUNDARY);

    const result = await run(SUNDAY_0005);

    expect(result.injuriesEnded).toEqual(['inj-due']);
    const healedPlayer = await playerById(healed);
    expect(healedPlayer.currentInjury).toBeUndefined();
    expect(healedPlayer.stamina).toBe(100);
    expect(await repos.injuries.get(healed, due.startedAt)).toMatchObject({
      endedAt: SUNDAY_0005.toISOString(),
      endedReason: 'recovered',
    });

    const outPlayer = await playerById(stillOut);
    expect(outPlayer.currentInjury?.injuryId).toBe('inj-future');
    expect(outPlayer.stamina).toBe(100); // injured players still recover stamina
    expect((await repos.injuries.get(stillOut, future.startedAt))?.endedAt).toBeUndefined();

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: 'healed-sub',
      type: 'injury_recovered',
      message: CLEARED_TO_COMPETE_MESSAGE,
      sourceId: 'inj-due',
      sourceType: 'injury',
    });
  });

  it('runs a missed Sunday late on Tuesday, once', async () => {
    const tired = await makePlayer('tired', 10);
    await injure(tired, 'inj-due', SUNDAY_BOUNDARY);
    const tuesday = new Date('2026-11-24T15:00:00.000Z');

    const result = await run(tuesday);
    const again = await run(new Date('2026-11-24T16:00:00.000Z'));

    expect(result).toMatchObject({ status: 'recovered', weekKey: '2026-11-22', injuriesEnded: ['inj-due'] });
    expect(again.status).toBe('alreadyRun');
    expect((await playerById(tired)).stamina).toBe(100);
  });

  it('skips a week already run when a time zone change moves "now" back a week', async () => {
    await repos.user.siteConfig.markWeeklyJobWeek(RECOVERY_JOB, '2026-11-29');
    const tired = await makePlayer('tired', 10);

    expect((await run(SUNDAY_0005)).status).toBe('alreadyRun');
    expect((await playerById(tired)).stamina).toBe(10);
  });

  it('only one of two concurrent runs recovers', async () => {
    await setWeeklyRecovery(20);
    const tired = await makePlayer('tired', 10);

    const results = await Promise.all([run(SUNDAY_0005), run(SUNDAY_0005)]);

    expect(results.map((r) => r.status).sort()).toEqual(['alreadyRun', 'recovered']);
    expect((await playerById(tired)).stamina).toBe(30);
  });

  it('records the week as skipped while the injuries flag is off', async () => {
    await repos.user.siteConfig.updateFeatures({ injuries: false });
    const tired = await makePlayer('tired', 10);

    const off = await run(SUNDAY_0005);
    await repos.user.siteConfig.updateFeatures({ injuries: true });
    const later = await run(SUNDAY_0105);

    expect(off.status).toBe('injuriesOff');
    expect(later.status).toBe('alreadyRun');
    expect((await playerById(tired)).stamina).toBe(10);
  });

  it('handles the DST fall-back Sunday: one run at local 00:05, none at the repeated 01:xx hours', async () => {
    // 1 Nov 2026: clocks go back at 02:00 EDT. Sunday 00:05 EDT = 04:05Z.
    const tired = await makePlayer('tired', 10);
    const first = await run(new Date('2026-11-01T04:05:00.000Z'));
    const repeatedHourA = await run(new Date('2026-11-01T05:30:00.000Z')); // 01:30 EDT
    const repeatedHourB = await run(new Date('2026-11-01T06:30:00.000Z')); // 01:30 EST

    expect(first).toMatchObject({ status: 'recovered', weekKey: '2026-11-01' });
    expect([repeatedHourA.status, repeatedHourB.status]).toEqual(['alreadyRun', 'alreadyRun']);
    expect((await playerById(tired)).stamina).toBe(100);
  });

  it('handles the DST spring-forward Sunday: Saturday 23:30 EST is still the old week', async () => {
    // 8 Mar 2026: clocks go forward at 02:00 EST.
    await repos.user.siteConfig.markWeeklyJobWeek(RECOVERY_JOB, '2026-03-01');
    const tired = await makePlayer('tired', 10);
    const saturday = await run(new Date('2026-03-08T04:30:00.000Z')); // Sat 23:30 EST
    const sunday = await run(new Date('2026-03-08T05:05:00.000Z')); // Sun 00:05 EST

    expect(saturday.status).toBe('alreadyRun');
    expect(sunday).toMatchObject({ status: 'recovered', weekKey: '2026-03-08' });
    expect((await playerById(tired)).stamina).toBe(100);
  });

  it('ends a due injury of a deleted player without touching the player', async () => {
    const gone = await makePlayer('gone', 10);
    const injury = await injure(gone, 'inj-gone', SUNDAY_BOUNDARY);
    // Soft delete: the in-memory store hands back the stored row.
    (await repos.roster.players.findByIdWithDeleted(gone))!.deletedAt = '2026-11-20T00:00:00.000Z';

    const result = await run(SUNDAY_0005);

    expect(result).toMatchObject({ status: 'recovered', injuriesEnded: ['inj-gone'], failed: 0 });
    expect((await repos.injuries.get(gone, injury.startedAt))?.endedReason).toBe('recovered');
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('retries a player on a fresh read when a match result raced it', async () => {
    await setWeeklyRecovery(20);
    const tired = await makePlayer('tired', 50);
    const realRun = repos.runInTransaction;
    let raced = false;
    repos.runInTransaction = async (work) => {
      if (!raced) {
        raced = true;
        // A result drains the player between the job's read and its write.
        await realRun(async (tx) => {
          tx.updatePlayerCondition(tired, { stamina: 35 });
        });
      }
      return realRun(work);
    };

    const result = await run(SUNDAY_0005);

    expect(result).toMatchObject({ status: 'recovered', staminaRecovered: 1, failed: 0 });
    expect((await playerById(tired)).stamina).toBe(55);
  });

  it('keeps the week claimed and reports incomplete when a player keeps failing', async () => {
    const tired = await makePlayer('tired', 10);
    const fine = await makePlayer('fine', 10);
    const realRun = repos.runInTransaction;
    let drained = 10;
    repos.runInTransaction = async (work) => {
      // Every write races a new drain on `tired`, so its guard never holds.
      drained -= 1;
      await realRun(async (tx) => {
        tx.updatePlayerCondition(tired, { stamina: drained });
      });
      return realRun(work);
    };

    const result = await run(SUNDAY_0005);

    expect(result).toMatchObject({ status: 'incomplete', staminaRecovered: 1, failed: 1 });
    expect((await playerById(fine)).stamina).toBe(100);
    expect((await playerById(tired)).stamina).toBeLessThan(10);
    expect(await repos.user.siteConfig.getWeeklyJobWeek(RECOVERY_JOB)).toBe('2026-11-22');
    // Not retried on the next tick.
    expect((await run(SUNDAY_0105)).status).toBe('alreadyRun');
  });
});
