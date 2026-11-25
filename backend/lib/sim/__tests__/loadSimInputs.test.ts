import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildInMemoryRepositories } from '../../repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../repositories';
import type { Match, Player, WrestlerBuild } from '../../repositories/types';
import { NEUTRAL_FORM } from '../../policies/matchSim';
import { STAT_CAP } from '../../policies/buildRules';
import { loadSimInputs, simSidesFromMatch, strengthOfVictoriesForm } from '../loadSimInputs';

let repos: Repositories;
let matchCounter = 0;

async function addPlayer(name: string, partial: Partial<Player> = {}): Promise<string> {
  const created = await repos.roster.players.create({ name, currentWrestler: name });
  if (Object.keys(partial).length > 0) await repos.roster.players.update(created.playerId, partial);
  return created.playerId;
}

async function addWin(winnerId: string, loserId: string, seasonId?: string): Promise<void> {
  matchCounter += 1;
  const date = new Date(Date.UTC(2026, 0, 1, 0, matchCounter)).toISOString();
  const match: Match = {
    matchId: `m-${String(matchCounter).padStart(3, '0')}`,
    date,
    participants: [winnerId, loserId],
    winners: [winnerId],
    losers: [loserId],
    status: 'completed',
    createdAt: date,
    ...(seasonId ? { seasonId } : {}),
  };
  await repos.competition.matches.create({ ...match });
}

/** strong beats filler N times, filler beats weak N times. */
async function buildLeague(seasonId?: string): Promise<{ strong: string; weak: string; filler: string }> {
  const strong = await addPlayer('Strong');
  const weak = await addPlayer('Weak');
  const filler = await addPlayer('Filler');
  for (let index = 0; index < 4; index += 1) {
    await addWin(strong, filler, seasonId);
    await addWin(filler, weak, seasonId);
  }
  return { strong, weak, filler };
}

beforeEach(() => {
  matchCounter = 0;
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('loadSimInputs form', () => {
  it('rates a win over strong opponents above the same record against weak ones', async () => {
    const { strong, weak } = await buildLeague();
    const giantKiller = await addPlayer('Giant Killer');
    const bully = await addPlayer('Bully');
    await addWin(giantKiller, strong);
    await addWin(giantKiller, strong);
    await addWin(bully, weak);
    await addWin(bully, weak);

    const result = await loadSimInputs({ sides: [[giantKiller], [bully]] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [killerForm, bullyForm] = result.inputs.competitors.map((competitor) => competitor.form);
    expect(killerForm).toBeGreaterThan(bullyForm);
    expect(killerForm).toBeLessThanOrEqual(100);
    expect(bullyForm).toBeGreaterThanOrEqual(0);
    expect(result.inputs.formWindow).toEqual({ kind: 'recent', matchLimit: 10 });
  });

  it('gives a player with no matches the neutral 50', async () => {
    await buildLeague();
    const rookie = await addPlayer('Rookie');
    const other = await addPlayer('Other Rookie');
    const result = await loadSimInputs({ sides: [[rookie], [other]] });
    expect(result.ok && result.inputs.competitors.map((competitor) => competitor.form)).toEqual([
      NEUTRAL_FORM,
      NEUTRAL_FORM,
    ]);
  });

  it('uses only the active season when there is one', async () => {
    const season = await repos.season.seasons.create({ name: 'S1', startDate: '2026-01-01' });
    await repos.season.seasons.update(season.seasonId, { status: 'active' });
    const winner = await addPlayer('Winner');
    const loser = await addPlayer('Loser');
    // Winner dominated before the season; nothing yet this season.
    await addWin(winner, loser);
    await addWin(winner, loser);

    const result = await loadSimInputs({ sides: [[winner], [loser]] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inputs.formWindow).toEqual({ kind: 'season', seasonId: season.seasonId });
    expect(result.inputs.competitors.map((competitor) => competitor.form)).toEqual([NEUTRAL_FORM, NEUTRAL_FORM]);

    await addWin(winner, loser, season.seasonId);
    const after = await loadSimInputs({ sides: [[winner], [loser]] });
    if (!after.ok) throw new Error('expected ok');
    const [winnerForm, loserForm] = after.inputs.competitors.map((competitor) => competitor.form);
    expect(winnerForm).toBeGreaterThan(NEUTRAL_FORM);
    expect(loserForm).toBeLessThan(NEUTRAL_FORM);
  });

  it('uses the given seasonId over the active season', async () => {
    const winner = await addPlayer('Winner');
    const loser = await addPlayer('Loser');
    await addWin(winner, loser, 'old-season');
    const result = await loadSimInputs({ sides: [[winner], [loser]], seasonId: 'old-season' });
    if (!result.ok) throw new Error('expected ok');
    expect(result.inputs.formWindow).toEqual({ kind: 'season', seasonId: 'old-season' });
    expect(result.inputs.competitors[0].form).toBeGreaterThan(result.inputs.competitors[1].form);
  });

  it('counts only each sim player’s last 10 matches without a season', async () => {
    const veteran = await addPlayer('Veteran');
    const opponent = await addPlayer('Opponent');
    // Ten old wins, then ten recent losses: recent form is poor.
    for (let index = 0; index < 10; index += 1) await addWin(veteran, opponent);
    for (let index = 0; index < 10; index += 1) await addWin(opponent, veteran);
    const result = await loadSimInputs({ sides: [[veteran], [opponent]] });
    if (!result.ok) throw new Error('expected ok');
    const [veteranForm, opponentForm] = result.inputs.competitors.map((competitor) => competitor.form);
    expect(veteranForm).toBeLessThan(NEUTRAL_FORM);
    expect(opponentForm).toBeGreaterThan(NEUTRAL_FORM);
  });

  it('reads completed matches once per request', async () => {
    await buildLeague();
    const spy = vi.spyOn(repos.competition.matches, 'listCompleted');
    const [first, second] = (await repos.roster.players.list()).map((player) => player.playerId);
    await loadSimInputs({ sides: [[first], [second]] });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('loadSimInputs builds and sides', () => {
  it('scales an over-budget build down to the budget', async () => {
    const maxed: WrestlerBuild = {
      style: 'powerhouse',
      stats: { strikes: STAT_CAP, grapple: STAT_CAP, agility: STAT_CAP, endurance: STAT_CAP },
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const division = await repos.leagueOps.divisions.create({ name: 'Dev', isDevelopmental: true });
    const player = await addPlayer('Overspender', {
      build: maxed,
      divisionId: division.divisionId,
      finishers: [{ gameName: 'f', customName: 'F', level: 5 }],
    });
    const rookie = await addPlayer('Rookie');

    const result = await loadSimInputs({ sides: [[player], [rookie]] });
    if (!result.ok) throw new Error('expected ok');
    const competitor = result.inputs.competitors[0];
    expect(result.inputs.scaledPlayerIds).toEqual([player]);
    expect(competitor.style).toBe('powerhouse');
    expect(competitor.effectiveStats.agility).toBeLessThan(STAT_CAP);
    expect(competitor.finisherLevels[0]).toBeLessThan(5);
  });

  it('gives a player with no saved build the default build', async () => {
    const first = await addPlayer('First');
    const second = await addPlayer('Second');
    const result = await loadSimInputs({ sides: [[first], [second]] });
    if (!result.ok) throw new Error('expected ok');
    expect(result.inputs.competitors[0].style).toBe('allRounder');
    expect(result.inputs.scaledPlayerIds).toEqual([]);
  });

  it('keeps side order, members and side ids', async () => {
    const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map((name) => addPlayer(name)));
    const result = await loadSimInputs({ sides: [[a, b], [c, d]], sideIds: ['red', 'blue'] });
    if (!result.ok) throw new Error('expected ok');
    expect(result.inputs.sides.map((side) => side.sideId)).toEqual(['red', 'blue']);
    expect(result.inputs.sides.map((side) => side.members.map((member) => member.playerId))).toEqual([
      [a, b],
      [c, d],
    ]);
    const defaults = await loadSimInputs({ sides: [[a], [c]] });
    expect(defaults.ok && defaults.inputs.sides.map((side) => side.sideId)).toEqual(['side-1', 'side-2']);
  });

  it('reports unknown players', async () => {
    const known = await addPlayer('Known');
    const result = await loadSimInputs({ sides: [[known], ['ghost']] });
    expect(result).toEqual({ ok: false, missingPlayerIds: ['ghost'] });
  });
});

describe('simSidesFromMatch', () => {
  it('uses teams when present, otherwise one side per participant', () => {
    expect(simSidesFromMatch({ participants: ['a', 'b', 'c', 'd'], teams: [['a', 'b'], ['c', 'd']] })).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(simSidesFromMatch({ participants: ['a', 'b', 'c'] })).toEqual([['a'], ['b'], ['c']]);
  });
});

describe('strengthOfVictoriesForm', () => {
  it('stays within 0–100 and is neutral for players without matches', () => {
    const forms = strengthOfVictoriesForm(
      [
        { matchId: '1', date: '2026-01-01', participants: ['a', 'b'], winners: ['a'], losers: ['b'] },
        { matchId: '2', date: '2026-01-02', participants: ['a', 'b'], winners: ['a'], losers: ['b'] },
      ],
      ['a', 'b', 'c'],
    );
    expect(forms.get('a')).toBeGreaterThan(NEUTRAL_FORM);
    expect(forms.get('a')).toBeLessThanOrEqual(100);
    expect(forms.get('b')).toBeGreaterThanOrEqual(0);
    expect(forms.get('c')).toBe(NEUTRAL_FORM);
  });
});
