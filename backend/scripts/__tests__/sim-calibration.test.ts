import { describe, it, expect } from 'vitest';
import { DEFAULT_RUNS, formatReport, runCalibration, seededRoster } from '../sim-calibration';
import { SEEDED_BUILDS } from '../../functions/admin/seedBuilds';

describe('sim calibration (BLD-15)', () => {
  const report = runCalibration(DEFAULT_RUNS);

  it('keeps every BLD-05 anchor inside its band', () => {
    const outside = report.anchors.filter((entry) => !entry.inBand).map((entry) => `${entry.label}: ${entry.share}`);
    expect(outside).toEqual([]);
  });

  it('plays the seeded roster, including the default build', () => {
    const roster = seededRoster();
    expect(roster).toHaveLength(Object.keys(SEEDED_BUILDS).length + 1);
    expect(roster.map((competitor) => competitor.playerId)).toContain('Seth Rollins');
  });

  it('favours the higher-rated side more as the rating gap grows, and upsets still happen', () => {
    const filled = report.roster.buckets.filter((bucket) => bucket.matches > 0);
    for (let index = 1; index < filled.length; index += 1) {
      expect(filled[index].expected).toBeGreaterThan(filled[index - 1].expected);
    }
    // The odds the sim shows match what it does, within sampling noise.
    for (const bucket of filled.filter((entry) => entry.matches >= 500)) {
      expect(Math.abs(bucket.actual - bucket.expected)).toBeLessThan(0.03);
    }
    expect(report.roster.upsetRate).toBeGreaterThan(0.05);
    expect(report.roster.favouriteWinRate).toBeGreaterThan(0.5);
  });

  it('gives allRounder a smaller specialty lift than the other styles', () => {
    const allRounder = report.specialtyLift.find((row) => row.label.startsWith('allRounder'));
    const others = report.specialtyLift.filter((row) => !row.label.startsWith('allRounder'));
    for (const row of others) expect(row.share).toBeGreaterThan(allRounder?.share ?? 1);
  });

  it('is deterministic and prints every section', () => {
    expect(runCalibration(500)).toEqual(runCalibration(500));
    const text = formatReport(report);
    for (const heading of ['Seeded roster', 'Style edge alone', 'Specialty lift', 'Anchors:']) {
      expect(text).toContain(heading);
    }
  });
});
