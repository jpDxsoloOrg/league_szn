import { describe, it, expect } from 'vitest';
import {
  CORE_STATS,
  DEFAULT_TIER_BUDGET,
  DEVELOPMENTAL_BUDGET,
  NO_DIVISION_BUDGET,
  SIM_CATEGORIES,
  SPECIALTY_CATEGORIES,
  STAT_BASE,
  STAT_CAP,
  STAT_COST_BANDS,
  STYLES,
  STYLE_BEATS,
  STYLE_IDS,
  STYLE_SPECIALTIES,
  TIER_BUDGETS,
  budgetForDivision,
  isSimCategory,
  isSpecialtyAllowed,
  isStyleId,
  specialtyBonusFor,
  styleMatchup,
  SPECIALTY_BONUS,
  ALL_ROUNDER_SPECIALTY_BONUS,
  type StyleId,
} from '../buildRules';

describe('budgetForDivision', () => {
  it('gives the no-division budget when there is no division', () => {
    expect(budgetForDivision(undefined)).toBe(NO_DIVISION_BUDGET);
    expect(budgetForDivision(null)).toBe(NO_DIVISION_BUDGET);
  });

  it('gives the developmental budget whatever the tier', () => {
    expect(budgetForDivision({ isDevelopmental: true })).toBe(DEVELOPMENTAL_BUDGET);
    expect(budgetForDivision({ isDevelopmental: true, tier: 1 })).toBe(DEVELOPMENTAL_BUDGET);
  });

  it('uses TIER_BUDGETS for listed tiers', () => {
    expect(budgetForDivision({ tier: 1 })).toBe(TIER_BUDGETS[1]);
    expect(budgetForDivision({ tier: 2, isDevelopmental: false })).toBe(TIER_BUDGETS[2]);
    expect(TIER_BUDGETS[1]).toBe(160);
    expect(TIER_BUDGETS[2]).toBe(130);
  });

  it('uses the default for unlisted tiers and untiered divisions', () => {
    expect(budgetForDivision({ tier: 3 })).toBe(DEFAULT_TIER_BUDGET);
    expect(budgetForDivision({ tier: 42 })).toBe(DEFAULT_TIER_BUDGET);
    expect(budgetForDivision({})).toBe(DEFAULT_TIER_BUDGET);
  });

  it('treats a stored null tier as untiered', () => {
    const storedRow = JSON.parse('{"tier":null}') as { tier?: number };
    expect(budgetForDivision(storedRow)).toBe(DEFAULT_TIER_BUDGET);
  });
});

describe('stat cost bands', () => {
  it('are contiguous from just above base to the cap', () => {
    expect(STAT_COST_BANDS[0].from).toBe(STAT_BASE + 1);
    expect(STAT_COST_BANDS[STAT_COST_BANDS.length - 1].to).toBe(STAT_CAP);
    for (let index = 1; index < STAT_COST_BANDS.length; index++) {
      expect(STAT_COST_BANDS[index].from).toBe(STAT_COST_BANDS[index - 1].to + 1);
    }
  });
});

describe('STYLE_BEATS', () => {
  const cycleStyles = STYLE_IDS.filter((style) => style !== 'allRounder');

  it('leaves allRounder out of the cycle', () => {
    expect(STYLE_BEATS.allRounder).toBeUndefined();
    expect(Object.values(STYLE_BEATS)).not.toContain('allRounder');
  });

  it('has every other style beat exactly one and lose to exactly one', () => {
    for (const style of cycleStyles) {
      expect(STYLE_BEATS[style]).toBeDefined();
      const beatenBy = cycleStyles.filter((other) => STYLE_BEATS[other] === style);
      expect(beatenBy).toHaveLength(1);
    }
  });

  it('forms a single cycle through all five styles', () => {
    const visited = new Set<string>();
    let current: StyleId = 'powerhouse';
    for (let step = 0; step < cycleStyles.length; step++) {
      visited.add(current);
      const next: StyleId | undefined = STYLE_BEATS[current];
      if (next === undefined) throw new Error(`${current} beats nobody`);
      current = next;
    }
    expect(current).toBe('powerhouse');
    expect(visited.size).toBe(cycleStyles.length);
  });

  it('styleMatchup is +1 / -1 / 0', () => {
    expect(styleMatchup('powerhouse', 'highFlyer')).toBe(1);
    expect(styleMatchup('highFlyer', 'powerhouse')).toBe(-1);
    expect(styleMatchup('powerhouse', 'technician')).toBe(0);
    expect(styleMatchup('powerhouse', 'powerhouse')).toBe(0);
    for (const style of STYLE_IDS) {
      expect(styleMatchup('allRounder', style)).toBe(0);
      expect(styleMatchup(style, 'allRounder')).toBe(0);
    }
  });
});

describe('STYLES', () => {
  it('only names core stats in bonuses', () => {
    for (const style of STYLE_IDS) {
      for (const stat of Object.keys(STYLES[style].statBonuses)) {
        expect(CORE_STATS).toContain(stat);
      }
    }
  });

  it('gives every style the same total bonus', () => {
    const totals = STYLE_IDS.map((style) =>
      Object.values(STYLES[style].statBonuses).reduce((sum, bonus) => sum + (bonus ?? 0), 0),
    );
    expect(new Set(totals).size).toBe(1);
  });
});

describe('specialties', () => {
  it('every style has at least one specialty', () => {
    for (const style of STYLE_IDS) {
      expect(STYLE_SPECIALTIES[style].length).toBeGreaterThan(0);
    }
  });

  it('powerhouse cannot take highRisk but can take cage', () => {
    expect(isSpecialtyAllowed('powerhouse', 'highRisk')).toBe(false);
    expect(isSpecialtyAllowed('powerhouse', 'cage')).toBe(true);
  });

  it('standard is never allowed', () => {
    for (const style of STYLE_IDS) {
      expect(isSpecialtyAllowed(style, 'standard')).toBe(false);
      expect(STYLE_SPECIALTIES[style]).not.toContain('standard');
    }
    expect(SPECIALTY_CATEGORIES).not.toContain('standard');
  });

  it('allRounder may take any non-standard category', () => {
    for (const category of SIM_CATEGORIES.filter((value) => value !== 'standard')) {
      expect(isSpecialtyAllowed('allRounder', category)).toBe(true);
    }
  });

  it('allRounder earns the smaller bonus', () => {
    expect(specialtyBonusFor('allRounder')).toBe(ALL_ROUNDER_SPECIALTY_BONUS);
    expect(specialtyBonusFor('technician')).toBe(SPECIALTY_BONUS);
    expect(ALL_ROUNDER_SPECIALTY_BONUS).toBeLessThan(SPECIALTY_BONUS);
  });
});

describe('guards', () => {
  it('isStyleId and isSimCategory accept known values only', () => {
    expect(isStyleId('highFlyer')).toBe(true);
    expect(isStyleId('giant')).toBe(false);
    expect(isStyleId(3)).toBe(false);
    expect(isSimCategory('cage')).toBe(true);
    expect(isSimCategory('ladder')).toBe(false);
    expect(isSimCategory(undefined)).toBe(false);
  });
});
