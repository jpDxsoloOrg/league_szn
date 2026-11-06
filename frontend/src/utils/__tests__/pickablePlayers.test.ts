import { describe, expect, it } from 'vitest';
import { pickablePlayers, pickableTagTeams } from '../pickablePlayers';

const roster = [
  { playerId: 'real', currentWrestler: 'The Rock' },
  { playerId: 'placeholder', currentWrestler: 'Needs Wrestler' },
  { playerId: 'blank', currentWrestler: '  ' },
  { playerId: 'missing' },
];

const ids = (players: { playerId: string }[]) => players.map((player) => player.playerId);

describe('pickablePlayers', () => {
  it('drops every form of hidden player', () => {
    expect(ids(pickablePlayers(roster))).toEqual(['real']);
  });

  it('keeps a hidden player already on the record, in roster order', () => {
    expect(ids(pickablePlayers(roster, ['blank']))).toEqual(['real', 'blank']);
  });

  it('ignores kept ids that are not on the roster', () => {
    expect(ids(pickablePlayers(roster, ['gone']))).toEqual(['real']);
  });
});

describe('pickableTagTeams', () => {
  const teams = [
    { tagTeamId: 'clean', player1Id: 'real', player2Id: 'other' },
    { tagTeamId: 'half-hidden', player1Id: 'real', player2Id: 'blank' },
  ];

  const teamIds = (list: typeof teams) => list.map((team) => team.tagTeamId);

  it('drops a team with a hidden member, and keeps one whose member is not on the roster', () => {
    expect(teamIds(pickableTagTeams(teams, roster))).toEqual(['clean']);
  });

  it('keeps a team whose hidden member is already on the record', () => {
    expect(teamIds(pickableTagTeams(teams, roster, ['blank']))).toEqual(['clean', 'half-hidden']);
  });
});
