import { describe, expect, it } from 'vitest';
import { pickablePlayers, pickableTagTeams, tagTeamPickerOptions } from '../pickablePlayers';
import type { TagTeamPickerOption } from '../pickablePlayers';

const roster = [
  { playerId: 'real', currentWrestler: 'The Rock' },
  { playerId: 'placeholder', currentWrestler: 'Needs Wrestler' },
  { playerId: 'blank', currentWrestler: '  ' },
  { playerId: 'missing' },
];

const ids = (players: { playerId: string }[]) => players.map((player) => player.playerId);

describe('pickablePlayers', () => {
  const disciplined = [
    { playerId: 'gone', currentWrestler: 'Edge', discipline: { status: 'deactivated' as const } },
    { playerId: 'blocked', currentWrestler: 'Christian', discipline: { status: 'signup-blocked' as const } },
    { playerId: 'fine', currentWrestler: 'Kane' },
  ];

  it('drops a deactivated player but keeps a sign-up blocked one', () => {
    expect(ids(pickablePlayers(disciplined))).toEqual(['blocked', 'fine']);
  });

  it('keeps a deactivated player already on the record, such as a tournament entrant', () => {
    expect(ids(pickablePlayers(disciplined, ['gone']))).toEqual(['gone', 'blocked', 'fine']);
  });

  it('drops a tag team with a deactivated member unless that member is kept', () => {
    const teams = [{ player1Id: 'gone', player2Id: 'fine' }];
    expect(pickableTagTeams(teams, disciplined)).toEqual([]);
    expect(pickableTagTeams(teams, disciplined, ['gone'])).toEqual(teams);
  });

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

describe('tagTeamPickerOptions', () => {
  const teams = [
    { tagTeamId: 'clean', player1Id: 'real', player2Id: 'other' },
    { tagTeamId: 'half-hidden', player1Id: 'real', player2Id: 'blank' },
    { tagTeamId: 'all-hidden', player1Id: 'placeholder', player2Id: 'missing' },
  ];

  const counts = (options: TagTeamPickerOption<(typeof teams)[number]>[]) =>
    options.map((option) => [option.team.tagTeamId, option.unavailableMemberCount]);

  it('keeps every team and counts its hidden members', () => {
    expect(counts(tagTeamPickerOptions(teams, roster))).toEqual([
      ['clean', 0],
      ['half-hidden', 1],
      ['all-hidden', 2],
    ]);
  });

  it('does not count a hidden member who is already on the record', () => {
    expect(counts(tagTeamPickerOptions(teams, roster, ['blank']))).toEqual([
      ['clean', 0],
      ['half-hidden', 0],
      ['all-hidden', 2],
    ]);
  });
});
