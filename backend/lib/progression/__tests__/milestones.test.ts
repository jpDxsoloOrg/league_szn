import { describe, it, expect } from 'vitest';
import { detectMilestones, hasNewMilestones, PROGRESS_MILESTONE_THRESHOLDS } from '../milestones';
import type { PlayerProgression } from '../../repositories/types';

function row(progressPct: number, partial: Partial<PlayerProgression> = {}): PlayerProgression {
  return {
    playerId: 'p1',
    trackId: 't1',
    progressPct,
    goals: [
      { goalId: 'g-wins', current: 0, threshold: 4, met: false },
      { goalId: 'g-promos', current: 0, threshold: 2, met: false },
    ],
    computedAt: '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

const metGoals = (...ids: string[]): PlayerProgression['goals'] =>
  ['g-wins', 'g-promos'].map((goalId) => ({ goalId, current: 1, threshold: 1, met: ids.includes(goalId) }));

describe('detectMilestones', () => {
  it('uses the 50/75/100 thresholds from the ticket', () => {
    expect(PROGRESS_MILESTONE_THRESHOLDS).toEqual([50, 75, 100]);
  });

  it('treats a new row as a baseline: records what is reached, announces nothing', () => {
    const plan = detectMilestones({ after: row(80, { goals: metGoals('g-wins') }) }, 'callup');
    expect(hasNewMilestones(plan)).toBe(false);
    expect(plan.next).toEqual({ notifiedThresholds: [50, 75], notifiedGoalIds: ['g-wins'] });
    expect(plan.expected).toEqual({ thresholds: 0, goals: 0 });
  });

  it('announces a threshold crossed since the stored lists', () => {
    const plan = detectMilestones(
      {
        before: row(40, { notifiedThresholds: [], notifiedGoalIds: [] }),
        after: row(55, { notifiedThresholds: [], notifiedGoalIds: [] }),
      },
      'callup',
    );
    expect(plan.newThresholds).toEqual([50]);
    expect(plan.newGoalIds).toEqual([]);
    expect(plan.next).toEqual({ notifiedThresholds: [50], notifiedGoalIds: [] });
  });

  it('announces every threshold jumped in one go, plus newly met goals', () => {
    const plan = detectMilestones(
      {
        before: row(10, { notifiedThresholds: [], notifiedGoalIds: [] }),
        after: row(100, { goals: metGoals('g-wins', 'g-promos'), notifiedThresholds: [], notifiedGoalIds: [] }),
      },
      'promotion',
    );
    expect(plan.newThresholds).toEqual([50, 75, 100]);
    expect(plan.newGoalIds).toEqual(['g-wins', 'g-promos']);
  });

  it('fires each threshold once: an already notified threshold is not announced again', () => {
    const plan = detectMilestones(
      {
        before: row(55, { notifiedThresholds: [50], notifiedGoalIds: [] }),
        after: row(60, { notifiedThresholds: [50], notifiedGoalIds: [] }),
      },
      'callup',
    );
    expect(hasNewMilestones(plan)).toBe(false);
    expect(plan.next).toBeNull();
  });

  it('ignores a stale before: the stored lists on the upserted row win', () => {
    // Recompute-all reads `before` from an eventually consistent GSI.
    const plan = detectMilestones(
      {
        before: row(20),
        after: row(80, { goals: metGoals('g-wins'), notifiedThresholds: [50, 75], notifiedGoalIds: ['g-wins'] }),
      },
      'callup',
    );
    expect(hasNewMilestones(plan)).toBe(false);
    expect(plan.next).toBeNull();
  });

  it('never announces on a decrease and keeps the lists so re-crossing stays silent', () => {
    const dropped = detectMilestones(
      {
        before: row(80, { notifiedThresholds: [50, 75], notifiedGoalIds: ['g-wins'] }),
        after: row(30, { notifiedThresholds: [50, 75], notifiedGoalIds: ['g-wins'] }),
      },
      'callup',
    );
    expect(hasNewMilestones(dropped)).toBe(false);
    expect(dropped.next).toBeNull();

    const recrossed = detectMilestones(
      {
        before: row(30, { notifiedThresholds: [50, 75], notifiedGoalIds: ['g-wins'] }),
        after: row(60, { goals: metGoals('g-wins'), notifiedThresholds: [50, 75], notifiedGoalIds: ['g-wins'] }),
      },
      'callup',
    );
    expect(hasNewMilestones(recrossed)).toBe(false);
  });

  it('derives the baseline from before on a row written before CUP-11', () => {
    const plan = detectMilestones({ before: row(60), after: row(76) }, 'callup');
    expect(plan.newThresholds).toEqual([75]);
    expect(plan.next).toEqual({ notifiedThresholds: [50, 75], notifiedGoalIds: [] });
  });

  it('never announces on a relegation track', () => {
    const plan = detectMilestones(
      { before: row(10, { notifiedThresholds: [] }), after: row(100, { notifiedThresholds: [] }) },
      'relegation',
    );
    expect(hasNewMilestones(plan)).toBe(false);
    expect(plan.next).toBeNull();
  });

  it('reports the stored list sizes for the optimistic write', () => {
    const plan = detectMilestones(
      {
        before: row(60, { notifiedThresholds: [50], notifiedGoalIds: ['g-wins'] }),
        after: row(80, { notifiedThresholds: [50], notifiedGoalIds: ['g-wins'] }),
      },
      'callup',
    );
    expect(plan.expected).toEqual({ thresholds: 1, goals: 1 });
  });
});
