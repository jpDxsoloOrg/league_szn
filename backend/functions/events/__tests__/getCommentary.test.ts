import { describe, it, expect, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { Match } from '../../../lib/repositories/types';

import { handler as getCommentary } from '../getCommentary';
import type { CommentaryMatch } from '../getCommentary';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};
const now = () => new Date().toISOString();

function makeEvent(eventId: string | null): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: '/', pathParameters: eventId ? { eventId } : null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

async function player(name: string, extra: Record<string, unknown> = {}) {
  const p = await repos.roster.players.create({ name, currentWrestler: `W-${name}` });
  if (Object.keys(extra).length > 0) await repos.roster.players.update(p.playerId, extra);
  return p.playerId;
}

let matchCounter = 0;
async function completedMatch(participants: string[], winners: string[], date: string, extra: Partial<Match> = {}) {
  matchCounter++;
  return repos.competition.matches.create({
    matchId: `done-${matchCounter}`, date, matchFormat: 'singles',
    participants, winners, losers: participants.filter((p) => !winners.includes(p)),
    isChampionship: false, status: 'completed', createdAt: now(), ...extra,
  });
}

async function cardMatch(id: string, participants: string[], extra: Partial<Match> = {}) {
  return repos.competition.matches.create({
    matchId: id, date: '2030-01-01', matchFormat: 'singles', participants,
    isChampionship: false, status: 'scheduled', createdAt: now(), ...extra,
  });
}

async function eventWith(cards: Array<{ matchId: string; position: number; designation: string }>, seasonId?: string) {
  const e = await repos.leagueOps.events.create({ name: 'Fallout', eventType: 'weekly', date: '2030-01-01', seasonId });
  await repos.leagueOps.events.update(e.eventId, {
    matchCards: cards.map((c) => ({ ...c, designation: c.designation as 'opener' })),
  });
  return e.eventId;
}

async function call(eventId: string | null) {
  const res = await getCommentary(makeEvent(eventId), ctx, cb);
  return { status: res!.statusCode, body: JSON.parse(res!.body) };
}

beforeEach(() => {
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  matchCounter = 0;
});

describe('getCommentary', () => {
  it('400 without an eventId and 404 for an unknown event', async () => {
    expect((await call(null)).status).toBe(400);
    expect((await call('nope')).status).toBe(404);
  });

  it('resolves championship and stipulation names and drops unknown players', async () => {
    const [a, b] = [await player('A'), await player('B')];
    const title = await repos.competition.championships.create({ name: 'World', type: 'singles' });
    const stip = await repos.competition.stipulations.create({ name: 'Ladder Match' });
    await cardMatch('m1', [a, b, 'ghost-player'], {
      isChampionship: true, championshipId: title.championshipId, stipulationId: stip.stipulationId,
    });
    const eventId = await eventWith([{ matchId: 'm1', position: 1, designation: 'main-event' }]);

    const { body } = await call(eventId);
    const m = body.matches[0];

    expect(m.championshipName).toBe('World');
    expect(m.stipulationName).toBe('Ladder Match');
    expect(m.participants.map((p: { playerId: string }) => p.playerId)).toEqual([a, b]);
    expect(m.headToHead).toHaveLength(1);
  });

  it('falls back to the active season when the event points at a deleted season', async () => {
    const [a, b] = [await player('A'), await player('B')];
    const active = await repos.season.seasons.create({ name: 'Active', startDate: '2029-01-01' });
    await repos.season.standings.increment(active.seasonId, a, { wins: 4 });
    await cardMatch('m1', [a, b]);
    const eventId = await eventWith([{ matchId: 'm1', position: 1, designation: 'opener' }], 'deleted-season');

    const { body } = await call(eventId);

    expect(body.seasonName).toBe('Active');
    expect(body.matches[0].participants[0].seasonRecord).toEqual({ wins: 4, losses: 0, draws: 0 });
  });

  it('returns matches in stored card order with pre-show matches pulled first (as EventDetail does)', async () => {
    const [a, b] = [await player('A'), await player('B')];
    await cardMatch('main', [a, b]);
    await cardMatch('pre', [a, b]);
    await cardMatch('opener', [a, b]);
    const eventId = await eventWith([
      { matchId: 'opener', position: 1, designation: 'opener' },
      { matchId: 'main', position: 2, designation: 'main-event' },
      { matchId: 'pre', position: 3, designation: 'pre-show' },
    ]);

    const { status, body } = await call(eventId);

    expect(status).toBe(200);
    expect(body.matches.map((m: CommentaryMatch) => m.matchId)).toEqual(['pre', 'opener', 'main']);
    expect(body.name).toBe('Fallout');
  });

  it('includes moveset, bio, division and records for each participant', async () => {
    const division = await repos.leagueOps.divisions.create({ name: 'Raw' });
    const a = await player('A', {
      bio: 'Nightmare', divisionId: division.divisionId, alignment: 'face',
      signatures: [{ gameName: 'Cody Cutter', customName: 'The Cutter' }],
      finishers: [{ gameName: 'Cross Rhodes', customName: '' }],
    });
    const b = await player('B');
    await repos.runInTransaction(async (tx) => {
      tx.incrementPlayerRecord(a, { wins: 5, losses: 2, draws: 1 });
    });
    const season = await repos.season.seasons.create({ name: 'S1', startDate: '2029-01-01' });
    await repos.season.standings.increment(season.seasonId, a, { wins: 3, losses: 1 });
    await cardMatch('m1', [a, b]);
    const eventId = await eventWith([{ matchId: 'm1', position: 1, designation: 'opener' }], season.seasonId);

    const { body } = await call(eventId);
    const [pa, pb] = body.matches[0].participants;

    expect(body.seasonName).toBe('S1');
    expect(pa).toMatchObject({
      playerId: a, playerName: 'A', wrestlerName: 'W-A', bio: 'Nightmare', alignment: 'face',
      divisionName: 'Raw',
      signatures: [{ gameName: 'Cody Cutter', customName: 'The Cutter' }],
      finishers: [{ gameName: 'Cross Rhodes', customName: '' }],
      seasonRecord: { wins: 3, losses: 1, draws: 0 },
      allTimeRecord: { wins: 5, losses: 2, draws: 1 },
    });
    expect(pb.seasonRecord).toEqual({ wins: 0, losses: 0, draws: 0 });
    expect(pb.signatures).toEqual([]);
  });

  it('falls back to the active season when the event has none', async () => {
    const [a, b] = [await player('A'), await player('B')];
    const season = await repos.season.seasons.create({ name: 'Active', startDate: '2029-01-01' });
    await repos.season.standings.increment(season.seasonId, b, { wins: 2 });
    await cardMatch('m1', [a, b]);
    const eventId = await eventWith([{ matchId: 'm1', position: 1, designation: 'opener' }]);

    const { body } = await call(eventId);

    expect(body.seasonName).toBe('Active');
    expect(body.matches[0].participants[1].seasonRecord).toEqual({ wins: 2, losses: 0, draws: 0 });
  });

  it('computes every pair for a triple threat (3 pairs) with correct records', async () => {
    const [a, b, c] = [await player('A'), await player('B'), await player('C')];
    await completedMatch([a, b], [a], '2029-01-01');
    await completedMatch([a, b], [a], '2029-02-01');
    await completedMatch([a, b], [b], '2029-03-01');
    await completedMatch([b, c], [], '2029-01-15', { isDraw: true });
    await cardMatch('tt', [a, b, c], { matchFormat: 'triple-threat' });
    const eventId = await eventWith([{ matchId: 'tt', position: 1, designation: 'main-event' }]);

    const { body } = await call(eventId);
    const h2h = body.matches[0].headToHead;

    expect(h2h).toHaveLength(3);
    expect(h2h[0]).toMatchObject({ player1Id: a, player2Id: b, player1Wins: 2, player2Wins: 1, draws: 0, lastMatchDate: '2029-03-01', lastWinnerId: b });
    expect(h2h[1]).toMatchObject({ player1Id: a, player2Id: c, player1Wins: 0, player2Wins: 0, draws: 0 });
    expect(h2h[1].lastMatchDate).toBeUndefined();
    expect(h2h[2]).toMatchObject({ player1Id: b, player2Id: c, draws: 1 });
    expect(h2h[2].lastWinnerId).toBeUndefined();
  });

  it('computes 15 unique pairs for a six-man with no self-pairs', async () => {
    const ids = await Promise.all(['A', 'B', 'C', 'D', 'E', 'F'].map((n) => player(n)));
    await cardMatch('six', ids, { matchFormat: '6-man' });
    const eventId = await eventWith([{ matchId: 'six', position: 1, designation: 'main-event' }]);

    const { body } = await call(eventId);
    const h2h = body.matches[0].headToHead as Array<{ player1Id: string; player2Id: string }>;

    expect(h2h).toHaveLength(15);
    const keys = new Set(h2h.map((p) => [p.player1Id, p.player2Id].sort().join('|')));
    expect(keys.size).toBe(15);
    expect(h2h.every((p) => p.player1Id !== p.player2Id)).toBe(true);
    expect(body.matches[0].participants).toHaveLength(6);
  });

  it('multiManRecord counts only completed matches with 3+ participants', async () => {
    const [a, b, c] = [await player('A'), await player('B'), await player('C')];
    await completedMatch([a, b], [a], '2029-01-01'); // singles: ignored
    await completedMatch([a, b, c], [a], '2029-02-01'); // win
    await completedMatch([a, b, c], [c], '2029-03-01'); // loss
    await completedMatch([a, b, c], [], '2029-04-01', { isDraw: true }); // draw
    await completedMatch([a, b, c], [], '2029-05-01'); // no-contest: nobody won → not a loss
    await cardMatch('m', [a, b]);
    const eventId = await eventWith([{ matchId: 'm', position: 1, designation: 'opener' }]);

    const { body } = await call(eventId);

    expect(body.matches[0].participants[0].multiManRecord).toEqual({ wins: 1, losses: 1, draws: 2 });
    expect(body.matches[0].participants[1].multiManRecord).toEqual({ wins: 0, losses: 2, draws: 2 });
  });

  it('passes teams through and reads participants from filled slots', async () => {
    const [a, b, c, d] = [await player('A'), await player('B'), await player('C'), await player('D')];
    await cardMatch('tag', [a, b], {
      matchFormat: 'tag', teams: [[a, c], [b, d]],
      slots: [
        { slotId: 's1', position: 1, playerId: c, wrestlerNameSnapshot: 'Alt-C' },
        { slotId: 's2', position: 2, playerId: d },
        { slotId: 's3', position: 3 },
      ],
    });
    const eventId = await eventWith([{ matchId: 'tag', position: 1, designation: 'opener' }]);

    const { body } = await call(eventId);
    const m = body.matches[0];

    expect(m.teams).toEqual([[a, c], [b, d]]);
    expect(m.participants.map((p: { playerId: string }) => p.playerId)).toEqual([a, b, c, d]);
    expect(m.participants[2].wrestlerName).toBe('Alt-C');
    expect(m.headToHead).toHaveLength(6);
  });

  it('keeps a match with no participants in the list and skips missing matches', async () => {
    await cardMatch('empty', []);
    const eventId = await eventWith([
      { matchId: 'empty', position: 1, designation: 'opener' },
      { matchId: 'ghost', position: 2, designation: 'midcard' },
    ]);

    const { body } = await call(eventId);

    expect(body.matches).toHaveLength(1);
    expect(body.matches[0]).toMatchObject({ matchId: 'empty', participants: [], headToHead: [] });
  });
});
