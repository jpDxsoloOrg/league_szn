import { describe, expect, it } from 'vitest';
import { budgetForDivision } from '../buildBudgets';

const budgets = { tiers: { '1': 160, '2': 130 }, defaultTier: 100, developmental: 80, noDivision: 80 };

describe('budgetForDivision', () => {
  it('uses the budget of a listed tier', () => {
    expect(budgetForDivision(budgets, { tier: 1 })).toBe(160);
    expect(budgetForDivision(budgets, { tier: 2 })).toBe(130);
  });

  it('uses the default for an unlisted tier or no tier', () => {
    expect(budgetForDivision(budgets, { tier: 3 })).toBe(100);
    expect(budgetForDivision(budgets, {})).toBe(100);
  });

  it('uses the developmental budget whatever the tier', () => {
    expect(budgetForDivision(budgets, { tier: 1, isDevelopmental: true })).toBe(80);
  });

  it('uses the no-division budget without a division', () => {
    expect(budgetForDivision({ ...budgets, noDivision: 70 }, undefined)).toBe(70);
    expect(budgetForDivision({ ...budgets, noDivision: 70 }, null)).toBe(70);
  });
});
