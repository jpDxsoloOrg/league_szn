import { describe, it, expect } from 'vitest';
import { activeInjury, currentStamina, injuryWeeksLeft, isInjured } from '../index';
import {
  applyInjuryPatch,
  hasGmEdits,
  toCurrentInjury,
  toPublicInjuryHistory,
  type CurrentInjury,
  type Injury,
} from '../../repositories/injuries';

const currentInjury: CurrentInjury = {
  injuryId: 'inj-1',
  startedAt: '2026-11-24T20:00:00.000Z',
  returnsAt: '2026-12-06T05:00:00.000Z',
  severity: 'moderate',
  weeks: 2,
  matchId: 'm1',
  source: 'match',
};

const injury: Injury = {
  playerId: 'p1',
  startedAt: currentInjury.startedAt,
  injuryId: 'inj-1',
  source: 'match',
  severity: 'moderate',
  weeks: 2,
  returnsAt: currentInjury.returnsAt,
  matchId: 'm1',
  changes: [],
};

// INJ-03
describe('isInjured / activeInjury', () => {
  it('is false with no current injury', () => {
    expect(isInjured({}, '2026-11-25T00:00:00.000Z')).toBe(false);
    expect(activeInjury({}, new Date())).toBeNull();
  });

  it('is true until returnsAt, and false from returnsAt on, even before the weekly job clears it', () => {
    const player = { currentInjury };
    expect(isInjured(player, '2026-12-06T04:59:59.999Z')).toBe(true);
    expect(isInjured(player, '2026-12-06T05:00:00.000Z')).toBe(false);
    expect(isInjured(player, new Date('2026-12-10T00:00:00.000Z'))).toBe(false);
    expect(activeInjury(player, '2026-11-30T00:00:00.000Z')).toBe(currentInjury);
  });
});

describe('injuryWeeksLeft', () => {
  it('rounds up to whole weeks and is null when not injured', () => {
    const player = { currentInjury };
    expect(injuryWeeksLeft(player, '2026-11-24T20:00:00.000Z')).toBe(2);
    expect(injuryWeeksLeft(player, '2026-11-29T05:00:00.000Z')).toBe(1);
    expect(injuryWeeksLeft(player, '2026-12-06T05:00:00.000Z')).toBeNull();
    expect(injuryWeeksLeft({}, '2026-11-24T20:00:00.000Z')).toBeNull();
  });
});

describe('currentStamina', () => {
  it('reads missing stamina as full', () => {
    expect(currentStamina({}, 100)).toBe(100);
    expect(currentStamina({ stamina: 0 }, 100)).toBe(0);
    expect(currentStamina({ stamina: 62 }, 100)).toBe(62);
  });
});

describe('injury rows', () => {
  it('copies a row onto the player without the history fields', () => {
    expect(toCurrentInjury({ ...injury, note: 'n', createdBy: 'gm', changes: [{ kind: 'extended', at: 'x', by: 'gm' }] }))
      .toEqual({ ...currentInjury, note: 'n' });
  });

  it('applies a patch and appends changes without touching the original', () => {
    const change = { kind: 'extended' as const, at: '2026-11-25T00:00:00.000Z', by: 'gm' };
    const next = applyInjuryPatch(injury, { weeks: 3, returnsAt: '2026-12-13T05:00:00.000Z', appendChanges: [change] });
    expect(next).toMatchObject({ weeks: 3, returnsAt: '2026-12-13T05:00:00.000Z', changes: [change] });
    expect(injury.changes).toEqual([]);
  });

  it('counts GM edits but not a bought rehab', () => {
    expect(hasGmEdits(injury)).toBe(false);
    expect(hasGmEdits({ changes: [{ kind: 'rehab', at: 'x', by: 'player-sub' }] })).toBe(false);
    expect(hasGmEdits({ changes: [{ kind: 'shortened', at: 'x', by: 'gm-sub' }] })).toBe(true);
  });

  it('builds the public history without reverted injuries or private fields', () => {
    const storyline: Injury = {
      ...injury,
      injuryId: 'inj-2',
      startedAt: '2026-10-01T00:00:00.000Z',
      source: 'storyline',
      note: 'secret',
      createdBy: 'gm-sub',
      endedAt: '2026-10-11T04:00:00.000Z',
      endedReason: 'healedByGm',
      changes: [{ kind: 'healed', at: 'x', by: 'gm-sub', note: 'secret too' }],
    };
    const reverted: Injury = { ...injury, injuryId: 'inj-3', endedAt: 'y', endedReason: 'reverted' };

    const history = toPublicInjuryHistory([injury, storyline, reverted]);

    expect(history.map((row) => row.injuryId)).toEqual(['inj-1', 'inj-2']);
    expect(history[1]).toEqual({
      injuryId: 'inj-2',
      startedAt: '2026-10-01T00:00:00.000Z',
      returnsAt: injury.returnsAt,
      severity: 'moderate',
      weeks: 2,
      matchId: 'm1',
      endedAt: '2026-10-11T04:00:00.000Z',
    });
    expect(JSON.stringify(history)).not.toMatch(/secret|gm-sub|storyline|healedByGm/);
  });
});
