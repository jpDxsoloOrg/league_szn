import { describe, expect, it } from 'vitest';
import { findTagTeamForSide } from '../tagTeamSides';

const tagTeams = [
  { tagTeamId: 'usos', name: 'The Usos', player1Id: 'jey', player2Id: 'jimmy' },
  { tagTeamId: 'new-day', name: 'The New Day', player1Id: 'kofi', player2Id: 'woods' },
];

describe('findTagTeamForSide', () => {
  it('finds the team for an exact pair in either order', () => {
    expect(findTagTeamForSide(tagTeams, ['jey', 'jimmy'])?.name).toBe('The Usos');
    expect(findTagTeamForSide(tagTeams, ['jimmy', 'jey'])?.name).toBe('The Usos');
  });

  it('returns nothing for a pair that is not a team', () => {
    expect(findTagTeamForSide(tagTeams, ['jey', 'kofi'])).toBeUndefined();
  });

  it('returns nothing for a side that is not exactly two people', () => {
    expect(findTagTeamForSide(tagTeams, ['jey'])).toBeUndefined();
    expect(findTagTeamForSide(tagTeams, ['jey', 'jimmy', 'kofi'])).toBeUndefined();
    expect(findTagTeamForSide(tagTeams, undefined)).toBeUndefined();
  });
});
