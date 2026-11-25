import { describe, it, expect } from 'vitest';
import { resolveSimCategory, validateSimCategoryField } from '../category';
import type { MatchType, Stipulation } from '../../repositories/types';

const now = '2026-01-01T00:00:00.000Z';

function stipulation(stipulationId: string, extra: Partial<Stipulation> = {}): Stipulation {
  return { stipulationId, name: stipulationId, createdAt: now, updatedAt: now, ...extra };
}

function matchType(matchTypeId: string, name: string, extra: Partial<MatchType> = {}): MatchType {
  return { matchTypeId, name, createdAt: now, updatedAt: now, ...extra };
}

const stipulations: Stipulation[] = [
  stipulation('ladder', { simCategory: 'highRisk' }),
  stipulation('plain'),
  stipulation('legacy', { simCategory: 'bogus' as unknown as Stipulation['simCategory'] }),
];

const matchTypes: MatchType[] = [
  matchType('mt-iron', 'Iron Man', { simCategory: 'endurance' }),
  matchType('mt-singles', 'Singles'),
  matchType('mt-4way', 'Fatal 4-Way', { simCategory: 'hardcore' }),
];

describe('resolveSimCategory', () => {
  it("uses the stipulation's category over the match type's", () => {
    expect(resolveSimCategory({ stipulationId: 'ladder', matchFormat: 'Iron Man' }, stipulations, matchTypes))
      .toBe('highRisk');
  });

  it("falls back to the match type's category when the stipulation has none", () => {
    expect(resolveSimCategory({ stipulationId: 'plain', matchFormat: 'Iron Man' }, stipulations, matchTypes))
      .toBe('endurance');
  });

  it('ignores an unknown stored stipulation category', () => {
    expect(resolveSimCategory({ stipulationId: 'legacy', matchFormat: 'Iron Man' }, stipulations, matchTypes))
      .toBe('endurance');
  });

  it('falls back to the match type when the stipulation id is unknown', () => {
    expect(resolveSimCategory({ stipulationId: 'gone', matchFormat: 'Iron Man' }, stipulations, matchTypes))
      .toBe('endurance');
  });

  it('matches the match type by id, or by name ignoring case and punctuation', () => {
    expect(resolveSimCategory({ matchFormat: 'mt-iron' }, stipulations, matchTypes)).toBe('endurance');
    expect(resolveSimCategory({ matchFormat: 'fatal-4-way' }, stipulations, matchTypes)).toBe('hardcore');
    expect(resolveSimCategory({ matchType: 'IRON MAN' }, stipulations, matchTypes)).toBe('endurance');
  });

  it('returns standard when neither has a category', () => {
    expect(resolveSimCategory({ stipulationId: 'plain', matchFormat: 'singles' }, stipulations, matchTypes))
      .toBe('standard');
    expect(resolveSimCategory({}, stipulations, matchTypes)).toBe('standard');
    expect(resolveSimCategory({ matchFormat: 'Unknown' }, [], [])).toBe('standard');
  });
});

describe('validateSimCategoryField', () => {
  it('accepts a missing or known category', async () => {
    expect(await validateSimCategoryField({})).toBeNull();
    expect(await validateSimCategoryField({ simCategory: 'cage' })).toBeNull();
    expect(await validateSimCategoryField({ simCategory: 'standard' })).toBeNull();
  });

  it('rejects unknown values with a 400', async () => {
    for (const simCategory of ['ladder', '', null, 3]) {
      const result = await validateSimCategoryField({ simCategory });
      expect(result?.statusCode).toBe(400);
      expect(result?.body).toContain('simCategory must be one of');
    }
  });
});
