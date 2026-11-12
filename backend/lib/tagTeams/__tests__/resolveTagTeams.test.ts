import { describe, it, expect } from 'vitest';
import type { TagTeam } from '../../repositories/types';
import {
  buildTagTeamIndex,
  pairKey,
  resolveTeamForPair,
  splitSidesIntoTeams,
  type TagMatchInput,
} from '../resolveTagTeams';
import { InMemoryRosterRepository } from '../../repositories/inMemory/InMemoryRosterRepository';

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

const teamAB = team({ tagTeamId: 'team-ab', player1Id: 'a', player2Id: 'b' });
const teamCD = team({ tagTeamId: 'team-cd', player1Id: 'c', player2Id: 'd' });
const teamEF = team({ tagTeamId: 'team-ef', player1Id: 'e', player2Id: 'f' });

function tagMatch(overrides: Partial<TagMatchInput>): TagMatchInput {
  return {
    date: '2026-06-01T20:00:00.000Z',
    matchFormat: 'Tag Team',
    participants: [],
    ...overrides,
  };
}

describe('pairKey', () => {
  it('is independent of order', () => {
    expect(pairKey('b', 'a')).toBe('a|b');
    expect(pairKey('a', 'b')).toBe('a|b');
  });
});

describe('resolveTeamForPair', () => {
  const index = buildTagTeamIndex([teamAB, teamCD]);

  it('does not care about pair order', () => {
    expect(resolveTeamForPair(index, 'a', 'b', '2026-06-01T00:00:00.000Z')?.tagTeamId).toBe('team-ab');
    expect(resolveTeamForPair(index, 'b', 'a', '2026-06-01T00:00:00.000Z')?.tagTeamId).toBe('team-ab');
  });

  it('returns null for an unknown pair', () => {
    expect(resolveTeamForPair(index, 'a', 'c', '2026-06-01T00:00:00.000Z')).toBeNull();
  });

  it('returns null before the team was created', () => {
    expect(resolveTeamForPair(index, 'a', 'b', '2025-12-31T23:59:59.000Z')).toBeNull();
  });

  it('picks the right team when the pair dissolves and re-forms', () => {
    const first = team({
      tagTeamId: 'first-run',
      player1Id: 'x',
      player2Id: 'y',
      status: 'dissolved',
      createdAt: '2026-01-01T00:00:00.000Z',
      dissolvedAt: '2026-03-01T00:00:00.000Z',
    });
    // Re-formed with the players the other way round.
    const second = team({
      tagTeamId: 'second-run',
      player1Id: 'y',
      player2Id: 'x',
      createdAt: '2026-05-01T00:00:00.000Z',
    });
    const reformed = buildTagTeamIndex([second, first]);

    expect(resolveTeamForPair(reformed, 'x', 'y', '2026-02-01T00:00:00.000Z')?.tagTeamId).toBe('first-run');
    // Between runs: no team.
    expect(resolveTeamForPair(reformed, 'x', 'y', '2026-04-01T00:00:00.000Z')).toBeNull();
    // Dissolve moment itself belongs to nobody.
    expect(resolveTeamForPair(reformed, 'x', 'y', '2026-03-01T00:00:00.000Z')).toBeNull();
    expect(resolveTeamForPair(reformed, 'x', 'y', '2026-06-01T00:00:00.000Z')?.tagTeamId).toBe('second-run');
  });

  it('ignores teams that were never confirmed', () => {
    const pending = team({ tagTeamId: 'pending', player1Id: 'p', player2Id: 'q', status: 'pending_admin' });
    expect(resolveTeamForPair(buildTagTeamIndex([pending]), 'p', 'q', '2026-06-01T00:00:00.000Z')).toBeNull();
  });
});

describe('splitSidesIntoTeams', () => {
  const index = buildTagTeamIndex([teamAB, teamCD, teamEF]);

  it('ignores a singles match', () => {
    const singles = tagMatch({ matchFormat: 'singles', participants: ['a', 'c'], winners: ['a'], losers: ['c'] });
    expect(splitSidesIntoTeams(singles, index)).toBeNull();
  });

  it('resolves winners and losers of a 2v2 match without a teams field', () => {
    const result = splitSidesIntoTeams(
      tagMatch({ participants: ['a', 'b', 'c', 'd'], winners: ['b', 'a'], losers: ['d', 'c'] }),
      index,
    );
    expect(result).toEqual({
      sides: [
        { playerIds: ['b', 'a'], tagTeamId: 'team-ab', outcome: 'win' },
        { playerIds: ['d', 'c'], tagTeamId: 'team-cd', outcome: 'loss' },
      ],
      winners: 'team-ab',
      losers: ['team-cd'],
    });
  });

  it('uses match.teams when present', () => {
    const result = splitSidesIntoTeams(
      tagMatch({
        participants: ['a', 'b', 'c', 'd'],
        teams: [['c', 'd'], ['a', 'b']],
        winners: ['a', 'b'],
        losers: ['c', 'd'],
      }),
      index,
    );
    expect(result?.sides.map((side) => [side.tagTeamId, side.outcome])).toEqual([
      ['team-cd', 'loss'],
      ['team-ab', 'win'],
    ]);
    expect(result?.winners).toBe('team-ab');
    expect(result?.losers).toEqual(['team-cd']);
  });

  it('returns null for a side that is a random pairing', () => {
    const result = splitSidesIntoTeams(
      tagMatch({ participants: ['a', 'c', 'b', 'd'], winners: ['a', 'c'], losers: ['b', 'd'] }),
      index,
    );
    expect(result?.winners).toBeNull();
    expect(result?.losers).toEqual([null]);
    expect(result?.sides.every((side) => side.tagTeamId === null)).toBe(true);
  });

  it('handles a triple-threat tag match with teams', () => {
    const result = splitSidesIntoTeams(
      tagMatch({
        participants: ['a', 'b', 'c', 'd', 'e', 'f'],
        teams: [['a', 'b'], ['c', 'd'], ['e', 'f']],
        winners: ['e', 'f'],
        losers: ['a', 'b', 'c', 'd'],
      }),
      index,
    );
    expect(result?.winners).toBe('team-ef');
    expect(result?.losers).toEqual(['team-ab', 'team-cd']);
  });

  it('handles a triple-threat tag match without teams by pairing known teams', () => {
    const result = splitSidesIntoTeams(
      tagMatch({
        participants: ['a', 'b', 'c', 'd', 'e', 'f'],
        winners: ['a', 'b'],
        losers: ['c', 'e', 'd', 'f'],
      }),
      index,
    );
    expect(result?.winners).toBe('team-ab');
    expect(result?.losers).toEqual(['team-cd', 'team-ef']);
    expect(result?.sides[1].playerIds).toEqual(['c', 'd']);
    expect(result?.sides[2].playerIds).toEqual(['e', 'f']);
  });

  it('marks every side as draw for a drawn match', () => {
    const result = splitSidesIntoTeams(
      tagMatch({ teams: [['a', 'b'], ['c', 'd']], winners: ['a', 'b', 'c', 'd'], losers: [], isDraw: true }),
      index,
    );
    expect(result?.sides.map((side) => side.outcome)).toEqual(['draw', 'draw']);
    expect(result?.winners).toBeNull();
    expect(result?.losers).toEqual([]);
  });

  it('marks sides as pending before a result is recorded', () => {
    const result = splitSidesIntoTeams(tagMatch({ participants: ['a', 'b', 'c', 'd'] }), index);
    expect(result?.sides).toEqual([
      { playerIds: ['a', 'b'], tagTeamId: 'team-ab', outcome: 'pending' },
      { playerIds: ['c', 'd'], tagTeamId: 'team-cd', outcome: 'pending' },
    ]);
    expect(result?.winners).toBeNull();
  });

  it('treats 2-player teams as a tag match even without a tag format', () => {
    const result = splitSidesIntoTeams(
      tagMatch({ matchFormat: undefined, teams: [['a', 'b'], ['c', 'd']], winners: ['c', 'd'], losers: ['a', 'b'] }),
      index,
    );
    expect(result?.winners).toBe('team-cd');
  });
});

describe('InMemoryRosterRepository tagTeams.listAll', () => {
  it('returns teams of every status, including dissolved', async () => {
    const roster = new InMemoryRosterRepository();
    const created = await roster.tagTeams.create({ name: 'Old', player1Id: 'a', player2Id: 'b', status: 'active' });
    await roster.tagTeams.update(created.tagTeamId, { status: 'dissolved' });
    await roster.tagTeams.create({ name: 'New', player1Id: 'c', player2Id: 'd', status: 'active' });

    const all = await roster.tagTeams.listAll();
    expect(all.map((t) => t.status).sort()).toEqual(['active', 'dissolved']);
  });
});
