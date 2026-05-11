import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as getFactionStats } from '../getFactionStats';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(
  stableId: string,
  qs: Record<string, string> | null = null,
): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: `/stables/${stableId}/stats`,
    pathParameters: { stableId },
    queryStringParameters: qs,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
  };
}

interface PlayerSeed {
  name: string;
  wrestler: string;
}

async function makePlayer(seed: PlayerSeed): Promise<{ playerId: string }> {
  const p = await repos.roster.players.create({
    name: seed.name,
    currentWrestler: seed.wrestler,
  });
  return { playerId: p.playerId };
}

interface MatchSeed {
  matchId: string;
  date: string; // ISO
  matchFormat: string;
  participants: string[];
  winners?: string[];
  losers?: string[];
  isDraw?: boolean;
  teams?: string[][];
  seasonId?: string;
}

async function makeMatch(seed: MatchSeed): Promise<void> {
  await repos.competition.matches.create({
    matchId: seed.matchId,
    date: seed.date,
    matchFormat: seed.matchFormat,
    participants: seed.participants,
    winners: seed.winners,
    losers: seed.losers,
    isDraw: seed.isDraw,
    teams: seed.teams,
    seasonId: seed.seasonId,
    status: 'completed',
    createdAt: seed.date,
    updatedAt: seed.date,
  });
}

async function seedFixture() {
  const a1 = await makePlayer({ name: 'A1', wrestler: 'Rock' });
  const a2 = await makePlayer({ name: 'A2', wrestler: 'Cena' });
  const a3 = await makePlayer({ name: 'A3', wrestler: 'Punk' });
  const a4 = await makePlayer({ name: 'A4', wrestler: 'Orton' });
  const a5 = await makePlayer({ name: 'A5', wrestler: 'Edge' });
  const b1 = await makePlayer({ name: 'B1', wrestler: 'Triple H' });
  const b2 = await makePlayer({ name: 'B2', wrestler: 'HBK' });
  const b3 = await makePlayer({ name: 'B3', wrestler: 'Undertaker' });
  const n1 = await makePlayer({ name: 'Neutral1', wrestler: 'JBL' });
  const n2 = await makePlayer({ name: 'Neutral2', wrestler: 'MVP' });
  const n3 = await makePlayer({ name: 'Neutral3', wrestler: 'Show' });

  const factionA = await repos.roster.stables.create({
    name: 'Faction A',
    leaderId: a1.playerId,
    memberIds: [a1.playerId, a2.playerId, a3.playerId, a4.playerId, a5.playerId],
    status: 'active',
  });

  const factionB = await repos.roster.stables.create({
    name: 'Faction B',
    leaderId: b1.playerId,
    memberIds: [b1.playerId, b2.playerId, b3.playerId],
    status: 'active',
  });

  // 10 completed matches — see fixture comments for the expected per-faction
  // and per-member rollups.
  await makeMatch({
    matchId: 'm1',
    date: '2026-01-01T00:00:00.000Z',
    matchFormat: 'singles',
    participants: [a1.playerId, b1.playerId],
    winners: [a1.playerId],
    losers: [b1.playerId],
    seasonId: 's1',
  });
  await makeMatch({
    matchId: 'm2',
    date: '2026-01-02T00:00:00.000Z',
    matchFormat: 'singles',
    participants: [a2.playerId, b2.playerId],
    winners: [b2.playerId],
    losers: [a2.playerId],
    seasonId: 's1',
  });
  await makeMatch({
    matchId: 'm3',
    date: '2026-01-03T00:00:00.000Z',
    matchFormat: 'singles',
    participants: [a3.playerId, b3.playerId],
    isDraw: true,
    seasonId: 's1',
  });
  await makeMatch({
    matchId: 'm4',
    date: '2026-01-04T00:00:00.000Z',
    matchFormat: 'tag',
    participants: [a1.playerId, a2.playerId, b1.playerId, b2.playerId],
    teams: [
      [a1.playerId, a2.playerId],
      [b1.playerId, b2.playerId],
    ],
    winners: [a1.playerId, a2.playerId],
    losers: [b1.playerId, b2.playerId],
    seasonId: 's1',
  });
  // Intra-faction match — skipped from per-faction totals.
  await makeMatch({
    matchId: 'm5',
    date: '2026-01-05T00:00:00.000Z',
    matchFormat: 'singles',
    participants: [a4.playerId, a5.playerId],
    winners: [a4.playerId],
    losers: [a5.playerId],
    seasonId: 's1',
  });
  await makeMatch({
    matchId: 'm6',
    date: '2026-01-06T00:00:00.000Z',
    matchFormat: 'ladder',
    participants: [a1.playerId, n1.playerId],
    winners: [a1.playerId],
    losers: [n1.playerId],
    seasonId: 's1',
  });
  // Different season — for the season-filter test
  await makeMatch({
    matchId: 'm7',
    date: '2026-02-01T00:00:00.000Z',
    matchFormat: 'singles',
    participants: [a2.playerId, b1.playerId],
    winners: [a2.playerId],
    losers: [b1.playerId],
    seasonId: 's2',
  });
  // No seasonId at all — only visible in the all-time view
  await makeMatch({
    matchId: 'm8',
    date: '2026-02-02T00:00:00.000Z',
    matchFormat: 'singles',
    participants: [a3.playerId, b2.playerId],
    winners: [a3.playerId],
    losers: [b2.playerId],
  });
  await makeMatch({
    matchId: 'm9',
    date: '2026-02-03T00:00:00.000Z',
    matchFormat: 'singles',
    participants: [a4.playerId, n2.playerId],
    winners: [a4.playerId],
    losers: [n2.playerId],
    seasonId: 's1',
  });
  await makeMatch({
    matchId: 'm10',
    date: '2026-02-04T00:00:00.000Z',
    matchFormat: 'hiac',
    participants: [a5.playerId, n3.playerId],
    winners: [a5.playerId],
    losers: [n3.playerId],
    seasonId: 's1',
  });

  return { a1, a2, a3, a4, a5, b1, b2, b3, factionA, factionB };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('getFactionStats (FAC-07)', () => {
  it('returns 404 when the faction does not exist', async () => {
    const result = await getFactionStats(makeEvent('does-not-exist'), ctx, cb);
    expect(result!.statusCode).toBe(404);
  });

  it('returns an empty-but-valid payload for an active faction with no completed matches', async () => {
    const leader = await makePlayer({ name: 'Leader', wrestler: 'Rock' });
    const member = await makePlayer({ name: 'Member', wrestler: 'Cena' });
    const stable = await repos.roster.stables.create({
      name: 'Empty Faction',
      leaderId: leader.playerId,
      memberIds: [leader.playerId, member.playerId],
      status: 'active',
    });

    const result = await getFactionStats(makeEvent(stable.stableId), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);

    expect(body.factionId).toBe(stable.stableId);
    expect(body.factionName).toBe('Empty Faction');
    expect(body.seasonId).toBeNull();
    expect(body.totals).toEqual({
      wins: 0,
      losses: 0,
      draws: 0,
      winPercentage: 0,
      matchCount: 0,
      recentForm: [],
      currentStreak: { type: 'W', count: 0 },
    });
    expect(body.matchTypeBreakdown).toEqual([]);
    expect(body.headToHead).toEqual([]);
    expect(body.members).toHaveLength(2);
    for (const m of body.members) {
      expect(m.wins).toBe(0);
      expect(m.losses).toBe(0);
      expect(m.draws).toBe(0);
      expect(m.recentForm).toEqual([]);
    }
  });

  it('computes correct per-member W/L/D given a 10-match fixture across 5 members', async () => {
    const { a1, a2, a3, a4, a5, factionA } = await seedFixture();

    const result = await getFactionStats(makeEvent(factionA.stableId), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);

    const byPlayer = new Map<string, (typeof body.members)[number]>(
      body.members.map((m: { playerId: string }) => [m.playerId, m]),
    );

    // a1: M1 W, M4 W, M6 W
    expect(byPlayer.get(a1.playerId)).toMatchObject({ wins: 3, losses: 0, draws: 0 });
    // a2: M2 L, M4 W, M7 W
    expect(byPlayer.get(a2.playerId)).toMatchObject({ wins: 2, losses: 1, draws: 0 });
    // a3: M3 D, M8 W
    expect(byPlayer.get(a3.playerId)).toMatchObject({ wins: 1, losses: 0, draws: 1 });
    // a4: M5 W (intra), M9 W
    expect(byPlayer.get(a4.playerId)).toMatchObject({ wins: 2, losses: 0, draws: 0 });
    // a5: M5 L (intra), M10 W
    expect(byPlayer.get(a5.playerId)).toMatchObject({ wins: 1, losses: 1, draws: 0 });

    // recentForm must be newest-first; a1's most recent is M6 (W).
    expect(byPlayer.get(a1.playerId)!.recentForm[0]).toBe('W');

    // Per-faction totals are deduped — M4 only counts once despite a1+a2 both winning.
    expect(body.totals).toMatchObject({ wins: 7, losses: 1, draws: 1, matchCount: 9 });
  });

  it('strictly scopes to the supplied seasonId (excludes other seasons and seasonless matches)', async () => {
    const { factionA } = await seedFixture();

    const result = await getFactionStats(makeEvent(factionA.stableId, { seasonId: 's1' }), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body.seasonId).toBe('s1');
    // Season-1 only: M1 W, M2 L, M3 D, M4 W, M6 W, M9 W, M10 W → 5W 1L 1D (7 matches)
    expect(body.totals).toMatchObject({ wins: 5, losses: 1, draws: 1, matchCount: 7 });
    // Match-types in season-1: singles 2W/1L/1D, tag 1W, ladder 1W, hiac 1W (no M8 — seasonless)
    const formats = Object.fromEntries(
      body.matchTypeBreakdown.map((r: { matchFormat: string }) => [r.matchFormat, r]),
    );
    expect(formats.singles).toMatchObject({ wins: 2, losses: 1, draws: 1 });
    expect(formats.tag).toMatchObject({ wins: 1, losses: 0, draws: 0 });
    expect(formats.ladder).toMatchObject({ wins: 1, losses: 0, draws: 0 });
    expect(formats.hiac).toMatchObject({ wins: 1, losses: 0, draws: 0 });
  });

  it('sums match-type breakdown correctly across formats (all-time)', async () => {
    const { factionA } = await seedFixture();

    const result = await getFactionStats(makeEvent(factionA.stableId), ctx, cb);
    const body = JSON.parse(result!.body);

    const formats = Object.fromEntries(
      body.matchTypeBreakdown.map((r: { matchFormat: string }) => [r.matchFormat, r]),
    );

    // All-time: singles 4W/1L/1D (M1,M2,M3,M7,M8 — wait M2 was L, M8 was W; that's 3W from
    // M1+M7+M8 plus M2 L plus M3 D — = 3W/1L/1D). M9 is also singles → +1W → 4W/1L/1D.
    expect(formats.singles).toMatchObject({ wins: 4, losses: 1, draws: 1 });
    expect(formats.tag).toMatchObject({ wins: 1, losses: 0, draws: 0 });
    expect(formats.ladder).toMatchObject({ wins: 1, losses: 0, draws: 0 });
    expect(formats.hiac).toMatchObject({ wins: 1, losses: 0, draws: 0 });

    // Totals across formats must add up to the per-faction totals.
    const sum = body.matchTypeBreakdown.reduce(
      (acc: { w: number; l: number; d: number }, r: { wins: number; losses: number; draws: number }) => {
        acc.w += r.wins;
        acc.l += r.losses;
        acc.d += r.draws;
        return acc;
      },
      { w: 0, l: 0, d: 0 },
    );
    expect(sum).toEqual({ w: body.totals.wins, l: body.totals.losses, d: body.totals.draws });
  });

  it("head-to-head is symmetric: A's row for B mirrors B's row for A with W/L swapped", async () => {
    const { factionA, factionB } = await seedFixture();

    const aResp = JSON.parse(
      (await getFactionStats(makeEvent(factionA.stableId), ctx, cb))!.body,
    );
    const bResp = JSON.parse(
      (await getFactionStats(makeEvent(factionB.stableId), ctx, cb))!.body,
    );

    const aVsB = aResp.headToHead.find((r: { factionId: string }) => r.factionId === factionB.stableId);
    const bVsA = bResp.headToHead.find((r: { factionId: string }) => r.factionId === factionA.stableId);
    expect(aVsB).toBeDefined();
    expect(bVsA).toBeDefined();

    expect(aVsB.wins).toBe(bVsA.losses);
    expect(aVsB.losses).toBe(bVsA.wins);
    expect(aVsB.draws).toBe(bVsA.draws);
    // Sanity: matches against the other faction were M1, M2, M3, M4, M7, M8
    expect(aVsB.wins + aVsB.losses + aVsB.draws).toBe(6);
  });

  it('caps head-to-head to the top 5 opponent factions', async () => {
    // Build a subject faction and 6 opponent factions, each playing one match.
    const subjectLeader = await makePlayer({ name: 'Subject', wrestler: 'S' });
    const subject = await repos.roster.stables.create({
      name: 'Subject',
      leaderId: subjectLeader.playerId,
      memberIds: [subjectLeader.playerId],
      status: 'active',
    });

    for (let i = 0; i < 6; i++) {
      const opp = await makePlayer({ name: `O${i}`, wrestler: `W${i}` });
      await repos.roster.stables.create({
        name: `Opp${i}`,
        leaderId: opp.playerId,
        memberIds: [opp.playerId],
        status: 'active',
      });
      await makeMatch({
        matchId: `mhh-${i}`,
        date: `2026-03-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        matchFormat: 'singles',
        participants: [subjectLeader.playerId, opp.playerId],
        winners: [subjectLeader.playerId],
        losers: [opp.playerId],
        seasonId: 's1',
      });
    }

    const result = await getFactionStats(makeEvent(subject.stableId), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body.headToHead).toHaveLength(5);
  });

  it('returns 400 when stableId is missing', async () => {
    const event = makeEvent('');
    event.pathParameters = {};
    const result = await getFactionStats(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
  });
});
