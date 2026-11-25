import { describe, it, expect } from 'vitest';
import {
  injuryNotificationMessage,
  planMatchCondition,
  planMatchConditionRevert,
  withoutConditionReport,
  type PlanMatchConditionInput,
} from '../applyMatchCondition';
import { DEFAULT_INJURY_TUNABLES, type InjuryTunables } from '../../policies/fatigueDefaults';
import { injuryRowId, type Injury } from '../../repositories/injuries';
import type { Player } from '../../repositories/types';

// INJ-04

const NOW = '2026-11-24T20:00:00.000Z';

const tunables = (overrides: Partial<InjuryTunables> = {}): InjuryTunables => ({
  ...DEFAULT_INJURY_TUNABLES,
  version: 3,
  ...overrides,
});

/** Every roll injures (chance capped at 0.95, and these seeds roll below it). */
const alwaysInjure = (): InjuryTunables => tunables({ injuryChanceBands: [{ minStamina: 0, chance: 1 }] });
const neverInjure = (): InjuryTunables => tunables({ injuryChanceBands: [{ minStamina: 0, chance: 0 }] });

const player = (playerId: string, overrides: Partial<Player> = {}): Player => ({
  playerId,
  name: playerId,
  currentWrestler: playerId,
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
} as Player);

const singles = { matchId: 'm-singles', participants: ['p1', 'p2'], matchFormat: 'singles' };

function plan(overrides: Partial<PlanMatchConditionInput> = {}) {
  let next = 0;
  return planMatchCondition({
    match: singles,
    players: [player('p1'), player('p2')],
    category: 'standard',
    tunables: neverInjure(),
    divisionsById: new Map(),
    now: NOW,
    newInjuryId: () => `inj-${++next}`,
    ...overrides,
  });
}

describe('planMatchCondition', () => {
  it('drains every participant of a singles match by the category drain', () => {
    const result = plan();
    expect(result.tunablesVersion).toBe(3);
    expect(result.report).toEqual([
      expect.objectContaining({ playerId: 'p1', staminaBefore: 100, staminaAfter: 85, drain: 15 }),
      expect.objectContaining({ playerId: 'p2', staminaBefore: 100, staminaAfter: 85, drain: 15 }),
    ]);
    expect(result.conditionWrites).toEqual([
      { playerId: 'p1', patch: { stamina: 85 }, guard: { stamina: null, currentInjuryId: null } },
      { playerId: 'p2', patch: { stamina: 85 }, guard: { stamina: null, currentInjuryId: null } },
    ]);
    expect(result.newInjuries).toEqual([]);
  });

  it('applies the tag format multiplier', () => {
    const result = plan({
      match: { matchId: 'm-tag', participants: ['p1', 'p2', 'p3', 'p4'], teams: [['p1', 'p2'], ['p3', 'p4']] },
      players: ['p1', 'p2', 'p3', 'p4'].map((id) => player(id)),
      category: 'endurance',
    });
    // endurance 30 × tag 0.7 = 21
    expect(result.report.map((entry) => entry.drain)).toEqual([21, 21, 21, 21]);
  });

  it('drains from stored stamina and lets endurance lower the drain', () => {
    const result = plan({
      players: [
        player('p1', { stamina: 50 }),
        player('p2', { build: { style: 'technician', stats: { strikes: 40, grapple: 40, agility: 40, endurance: 100 } } } as Partial<Player>),
      ],
    });
    expect(result.report[0]).toMatchObject({ staminaBefore: 50, staminaAfter: 35 });
    expect(result.report[1].drain).toBeLessThan(15);
    expect(result.conditionWrites[0].guard).toEqual({ stamina: 50, currentInjuryId: null });
  });

  it('creates an injury and history row when the roll comes up', () => {
    const result = plan({ tunables: alwaysInjure() });
    expect(result.newInjuries).toHaveLength(2);
    const [injury] = result.newInjuries;
    expect(injury).toMatchObject({
      playerId: 'p1',
      startedAt: NOW,
      injuryId: 'inj-1',
      source: 'match',
      matchId: 'm-singles',
      changes: [],
    });
    expect(new Date(injury.returnsAt).getTime()).toBeGreaterThan(new Date(NOW).getTime());
    expect(result.report[0]).toMatchObject({
      injuryId: 'inj-1',
      severity: injury.severity,
      weeks: injury.weeks,
      returnsAt: injury.returnsAt,
    });
    expect(result.report[0].roll).toBeLessThan(result.report[0].chance);
    expect(result.conditionWrites[0].patch.currentInjury).toMatchObject({ injuryId: 'inj-1', source: 'match' });
    expect(result.injured.map(({ player: injured }) => injured.playerId)).toEqual(['p1', 'p2']);
  });

  it('rolls the same outcome for the same match, player and tunables version', () => {
    const first = plan({ tunables: tunables() });
    const second = plan({ tunables: tunables() });
    expect(second.report).toEqual(first.report);
    const otherVersion = plan({ tunables: tunables({ version: 4 }) });
    expect(otherVersion.report[0].roll).not.toBe(first.report[0].roll);
  });

  it('drains an already-injured player but gives no second injury, and logs it', () => {
    const currentInjury = {
      injuryId: 'storyline-1',
      startedAt: '2026-11-20T00:00:00.000Z',
      returnsAt: '2026-12-20T05:00:00.000Z',
      severity: 'major' as const,
      weeks: 4,
      source: 'storyline' as const,
    };
    const result = plan({ tunables: alwaysInjure(), players: [player('p1', { currentInjury }), player('p2')] });
    expect(result.report[0]).toMatchObject({ drain: 15, alreadyInjured: true });
    expect(result.report[0].injuryId).toBeUndefined();
    expect(result.conditionWrites[0]).toEqual({
      playerId: 'p1',
      patch: { stamina: 85 },
      guard: { stamina: null, currentInjuryId: 'storyline-1' },
    });
    expect(result.newInjuries.map((row) => row.playerId)).toEqual(['p2']);
  });

  it('ends a finished but uncleared injury row when a new injury replaces it', () => {
    const stale = {
      injuryId: 'old',
      startedAt: '2026-10-01T00:00:00.000Z',
      returnsAt: '2026-10-11T04:00:00.000Z',
      severity: 'minor' as const,
      weeks: 1,
      source: 'match' as const,
    };
    const result = plan({
      tunables: alwaysInjure(),
      players: [player('p1', { currentInjury: stale })],
      openStaleInjuryRows: new Set([injuryRowId('p1', stale.startedAt)]),
    });
    expect(result.endedInjuries).toEqual([
      { playerId: 'p1', startedAt: stale.startedAt, patch: { endedAt: stale.returnsAt, endedReason: 'recovered' } },
    ]);
    expect(result.newInjuries).toHaveLength(1);
  });

  it('passes the chance reduction hook through to the roll', () => {
    const result = plan({ tunables: alwaysInjure(), chanceReductionFor: (target) => (target.playerId === 'p1' ? 1 : 0) });
    expect(result.report[0]).toMatchObject({ chance: 0 });
    expect(result.report[0].injuryId).toBeUndefined();
    expect(result.newInjuries.map((row) => row.playerId)).toEqual(['p2']);
  });
});

describe('planMatchConditionRevert', () => {
  const injury: Injury = {
    playerId: 'p1',
    startedAt: NOW,
    injuryId: 'inj-1',
    source: 'match',
    severity: 'minor',
    weeks: 1,
    returnsAt: '2026-12-06T05:00:00.000Z',
    matchId: 'm1',
    changes: [],
  };
  const currentInjury = {
    injuryId: 'inj-1', startedAt: NOW, returnsAt: injury.returnsAt, severity: 'minor' as const, weeks: 1, source: 'match' as const,
  };
  const report = [
    { playerId: 'p1', staminaBefore: 100, staminaAfter: 85, drain: 15, chance: 0.95, roll: 0.1, injuryId: 'inj-1' },
    { playerId: 'p2', staminaBefore: 100, staminaAfter: 85, drain: 15, chance: 0.01, roll: 0.5 },
  ];

  it('refunds the drain (capped) and ends the injury as reverted', () => {
    const result = planMatchConditionRevert({
      report,
      playersById: new Map([
        ['p1', player('p1', { stamina: 85, currentInjury })],
        ['p2', player('p2', { stamina: 95 })],
      ]),
      injuriesById: new Map([['inj-1', injury]]),
      maxStamina: 100,
      now: '2026-11-25T00:00:00.000Z',
    });
    expect(result.conditionWrites).toEqual([
      { playerId: 'p1', patch: { stamina: 100, currentInjury: null }, guard: { stamina: 85, currentInjuryId: 'inj-1' } },
      { playerId: 'p2', patch: { stamina: 100 }, guard: { stamina: 95, currentInjuryId: null } },
    ]);
    expect(result.endedInjuries).toEqual([
      { playerId: 'p1', startedAt: NOW, patch: { endedAt: '2026-11-25T00:00:00.000Z', endedReason: 'reverted' } },
    ]);
  });

  it('leaves an injury a GM has edited, and skips deleted players', () => {
    const edited: Injury = { ...injury, changes: [{ kind: 'extended', at: NOW, by: 'gm' }] };
    const result = planMatchConditionRevert({
      report,
      playersById: new Map([
        ['p1', player('p1', { stamina: 60, currentInjury })],
        ['p2', player('p2', { deletedAt: NOW })],
      ]),
      injuriesById: new Map([['inj-1', edited]]),
      maxStamina: 100,
      now: NOW,
    });
    expect(result.endedInjuries).toEqual([]);
    expect(result.conditionWrites).toEqual([
      { playerId: 'p1', patch: { stamina: 75 }, guard: { stamina: 60, currentInjuryId: 'inj-1' } },
    ]);
  });
});

describe('public match rows and notification copy', () => {
  it('drops the condition report from a public row', () => {
    const row = { matchId: 'm1', conditionReport: [], tunablesVersion: 2, status: 'completed' };
    expect(withoutConditionReport(row)).toEqual({ matchId: 'm1', status: 'completed' });
  });

  it('says when the player is out until, in league time', () => {
    expect(injuryNotificationMessage('2026-11-24T20:00:00.000Z', '2026-12-06T05:00:00.000Z', 'America/New_York'))
      .toBe("You were injured in your match on Tue, Nov 24. You're out until Sun, Dec 6.");
  });
});
