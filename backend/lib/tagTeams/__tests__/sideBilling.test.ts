import { describe, it, expect } from 'vitest';
import type { TagTeam } from '../../repositories/types';
import { buildTagTeamIndex } from '../resolveTagTeams';
import { resolveSideTagTeams, sideTagTeamsField } from '../sideBilling';

function team(overrides: Partial<TagTeam> & Pick<TagTeam, 'tagTeamId' | 'player1Id' | 'player2Id'>): TagTeam {
  return {
    name: overrides.tagTeamId,
    status: 'active',
    wins: 0,
    losses: 0,
    draws: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const usos = team({ tagTeamId: 'usos', name: 'The Usos', player1Id: 'jey', player2Id: 'jimmy', imageUrl: 'https://img/usos.png' });
const newDay = team({ tagTeamId: 'new-day', name: 'New Day', player1Id: 'kofi', player2Id: 'woods' });
const MATCH_DATE = '2026-06-01T20:00:00.000Z';

describe('resolveSideTagTeams', () => {
  const index = buildTagTeamIndex([usos, newDay]);

  it('bills an exact pair as its team, aligned with teams', () => {
    const result = resolveSideTagTeams({ date: MATCH_DATE, teams: [['jey', 'jimmy'], ['kofi', 'woods']] }, index);
    expect(result).toEqual([
      { tagTeamId: 'usos', name: 'The Usos', imageUrl: 'https://img/usos.png' },
      { tagTeamId: 'new-day', name: 'New Day' },
    ]);
  });

  it('finds the same team when the pair is in reverse order', () => {
    const result = resolveSideTagTeams({ date: MATCH_DATE, teams: [['jimmy', 'jey'], ['x', 'y']] }, index);
    expect(result).toEqual([{ tagTeamId: 'usos', name: 'The Usos', imageUrl: 'https://img/usos.png' }, null]);
  });

  it('gives null for a three-person side', () => {
    const result = resolveSideTagTeams({ date: MATCH_DATE, teams: [['jey', 'jimmy', 'solo'], ['kofi', 'woods']] }, index);
    expect(result).toEqual([null, { tagTeamId: 'new-day', name: 'New Day' }]);
  });

  it('gives null for a pair that dissolved before the match date', () => {
    const dissolved = team({
      tagTeamId: 'old-usos',
      name: 'Old Usos',
      player1Id: 'jey',
      player2Id: 'jimmy',
      status: 'dissolved',
      dissolvedAt: '2026-03-01T00:00:00.000Z',
    });
    const result = resolveSideTagTeams(
      { date: MATCH_DATE, teams: [['jey', 'jimmy'], ['kofi', 'woods']] },
      buildTagTeamIndex([dissolved]),
    );
    expect(result).toEqual([null, null]);
  });

  it('picks the team active on the match date when a pair re-formed', () => {
    const first = team({
      tagTeamId: 'first',
      name: 'First Run',
      player1Id: 'jey',
      player2Id: 'jimmy',
      status: 'dissolved',
      createdAt: '2026-01-01T00:00:00.000Z',
      dissolvedAt: '2026-04-01T00:00:00.000Z',
    });
    const reformed = team({
      tagTeamId: 'reformed',
      name: 'Reunion',
      player1Id: 'jimmy',
      player2Id: 'jey',
      createdAt: '2026-05-01T00:00:00.000Z',
    });
    const reformedIndex = buildTagTeamIndex([reformed, first]);
    const teams = [['jey', 'jimmy']];

    expect(resolveSideTagTeams({ date: '2026-02-01T00:00:00.000Z', teams }, reformedIndex)).toEqual([
      { tagTeamId: 'first', name: 'First Run' },
    ]);
    expect(resolveSideTagTeams({ date: '2026-04-15T00:00:00.000Z', teams }, reformedIndex)).toEqual([null]);
    expect(resolveSideTagTeams({ date: MATCH_DATE, teams }, reformedIndex)).toEqual([
      { tagTeamId: 'reformed', name: 'Reunion' },
    ]);
  });

  it('returns undefined when the match has no teams', () => {
    expect(resolveSideTagTeams({ date: MATCH_DATE }, index)).toBeUndefined();
    expect(resolveSideTagTeams({ date: MATCH_DATE, teams: [] }, index)).toBeUndefined();
  });
});

describe('sideTagTeamsField', () => {
  const index = buildTagTeamIndex([usos]);

  it('adds nothing without an index', () => {
    expect(sideTagTeamsField({ date: MATCH_DATE, teams: [['jey', 'jimmy']] }, null)).toEqual({});
  });

  it('adds nothing when teams is malformed', () => {
    expect(sideTagTeamsField({ date: MATCH_DATE, teams: 'jey,jimmy' }, index)).toEqual({});
    expect(sideTagTeamsField({ date: MATCH_DATE, teams: [[1, 2]] }, index)).toEqual({});
  });

  it('adds the aligned list for a valid match', () => {
    expect(sideTagTeamsField({ date: MATCH_DATE, teams: [['jey', 'jimmy'], ['a', 'b']] }, index)).toEqual({
      sideTagTeams: [{ tagTeamId: 'usos', name: 'The Usos', imageUrl: 'https://img/usos.png' }, null],
    });
  });
});
