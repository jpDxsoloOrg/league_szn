import { describe, it, expect, vi } from 'vitest';
import {
  findDefaultDivisionForNewWrestlers,
  findDevelopmentalDivisions,
  validateDivisionFlags,
} from '../divisions';
import type { Division } from '../repositories/types';

function division(overrides: Partial<Division> & { divisionId: string }): Division {
  return {
    name: overrides.divisionId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('findDefaultDivisionForNewWrestlers', () => {
  it('prefers the flagged division over a "Young Boys" name match', () => {
    const warn = vi.fn();
    const result = findDefaultDivisionForNewWrestlers(
      [
        division({ divisionId: 'yb', name: 'Young Boys' }),
        division({ divisionId: 'dojo', name: 'Dojo', isDefaultForNewWrestlers: true }),
      ],
      warn,
    );
    expect(result).toEqual({ division: expect.objectContaining({ divisionId: 'dojo' }), source: 'flag' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('picks the oldest flagged division and warns when several carry the flag', () => {
    const warn = vi.fn();
    const result = findDefaultDivisionForNewWrestlers(
      [
        division({ divisionId: 'newer', isDefaultForNewWrestlers: true, createdAt: '2026-05-01T00:00:00.000Z' }),
        division({ divisionId: 'older', isDefaultForNewWrestlers: true, createdAt: '2026-02-01T00:00:00.000Z' }),
      ],
      warn,
    );
    expect(result.division?.divisionId).toBe('older');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Multiple divisions'));
  });

  it('falls back to a case-insensitive "Young Boys" name match with a warning', () => {
    const warn = vi.fn();
    const result = findDefaultDivisionForNewWrestlers(
      [division({ divisionId: 'raw', name: 'Raw' }), division({ divisionId: 'yb', name: '  young BOYS ' })],
      warn,
    );
    expect(result).toEqual({ division: expect.objectContaining({ divisionId: 'yb' }), source: 'name-fallback' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('falling back to name match'));
  });

  it('returns no division when nothing is flagged or named Young Boys', () => {
    const warn = vi.fn();
    expect(findDefaultDivisionForNewWrestlers([division({ divisionId: 'raw', name: 'Raw' })], warn)).toEqual({
      division: undefined,
      source: 'none',
    });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('findDevelopmentalDivisions', () => {
  it('returns only flagged divisions, oldest first', () => {
    const result = findDevelopmentalDivisions([
      division({ divisionId: 'b', isDevelopmental: true, createdAt: '2026-03-01T00:00:00.000Z' }),
      division({ divisionId: 'raw' }),
      division({ divisionId: 'a', isDevelopmental: true, createdAt: '2026-02-01T00:00:00.000Z' }),
      division({ divisionId: 'off', isDevelopmental: false }),
    ]);
    expect(result.map((d) => d.divisionId)).toEqual(['a', 'b']);
  });
});

describe('validateDivisionFlags', () => {
  it('accepts booleans and absent flags', () => {
    expect(validateDivisionFlags({ isDevelopmental: true, isDefaultForNewWrestlers: false })).toBeNull();
    expect(validateDivisionFlags({ name: 'Raw' })).toBeNull();
  });

  it('rejects non-boolean flags', () => {
    const result = validateDivisionFlags({ isDefaultForNewWrestlers: 'true' });
    expect(result?.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('isDefaultForNewWrestlers must be a boolean');
  });
});
