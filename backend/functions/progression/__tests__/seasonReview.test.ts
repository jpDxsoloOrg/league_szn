import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from 'aws-lambda';

vi.mock('../../../lib/authenticate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/authenticate')>();
  const { presetCallerAuthenticate } = await import('../../../lib/__tests__/presetCallerAuth');
  return { ...actual, authenticate: presetCallerAuthenticate(actual.authenticate) };
});
import type { Repositories } from '../../../lib/repositories/registry';
import type { ProgressionTrack } from '../../../lib/repositories';

const { state, mockCreateNotification, mockInvokeAsync } = vi.hoisted(() => ({
  state: { repos: undefined as unknown as Repositories },
  mockCreateNotification: vi.fn(),
  mockInvokeAsync: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => state.repos,
}));
vi.mock('../../../lib/notifications', () => ({ createNotification: mockCreateNotification }));
vi.mock('../../../lib/asyncLambda', () => ({ invokeAsync: mockInvokeAsync }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import { handler } from '../handler';
import {
  rankBySeasonRecord,
  recommendMovement,
  snapshotSeasonReviews,
  SEASON_REVIEW_PROMOTE_TOP_N,
} from '../seasonSnapshot';

const ctx = {} as Context;
const cb: Callback = () => {};

function apiEvent(
  method: 'GET' | 'POST',
  resource: string,
  seasonId: string,
  body?: unknown,
  groups = 'Moderator',
): APIGatewayProxyEvent {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    headers: {},
    httpMethod: method,
    resource,
    path: resource.replace('{seasonId}', seasonId),
    pathParameters: { seasonId },
    queryStringParameters: null,
    requestContext: {
      authorizer: { groups, username: 'gm', email: 'gm@test.com', principalId: 'sub-gm' },
    },
  } as unknown as APIGatewayProxyEvent;
}

async function call(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return (await handler(event, ctx, cb)) as APIGatewayProxyResult;
}

const getReviews = (seasonId: string, groups?: string) =>
  call(apiEvent('GET', '/progression/reviews/{seasonId}', seasonId, undefined, groups));
const apply = (seasonId: string, body: unknown) =>
  call(apiEvent('POST', '/progression/reviews/{seasonId}/apply', seasonId, body));

function track(trackId: string, kind: 'promotion' | 'relegation', fromDivisionId: string): ProgressionTrack {
  return {
    trackId,
    kind,
    name: trackId,
    fromDivisionId,
    goals: [],
    windowMode: 'season',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

interface Fixture {
  seasonId: string;
  rawId: string;
  mainEventId: string;
  nxtId: string;
  /** promotionPct 100, no season matches. */
  ace: string;
  /** relegationPct 100, flagged, holds the Main Event title. */
  champ: string;
  /** Top of the division's season table on points (fewer wins than midcard), low progress. */
  leader: string;
  /** Nothing special. */
  midcard: string;
  /** In a division without movement tracks. */
  rawStar: string;
}

async function seed(): Promise<Fixture> {
  const repos = state.repos;
  const raw = await repos.leagueOps.divisions.create({ name: 'Raw', tier: 1 });
  const mainEvent = await repos.leagueOps.divisions.create({ name: 'Main Event', tier: 2 });
  const nxt = await repos.leagueOps.divisions.create({ name: 'NXT', tier: 3 });
  const season = await repos.season.seasons.create({ name: 'Season 1', startDate: '2026-01-01T00:00:00.000Z' });

  // Joined before the season, so every season result counts in the division table.
  const mk = async (name: string, divisionId: string) =>
    (await repos.roster.players.create({
      name,
      currentWrestler: name,
      divisionId,
      divisionJoinedAt: '2026-01-01T00:00:00.000Z',
    })).playerId;
  const ace = await mk('Ace', mainEvent.divisionId);
  const champ = await mk('Champ', mainEvent.divisionId);
  const leader = await mk('Leader', mainEvent.divisionId);
  const midcard = await mk('Midcard', mainEvent.divisionId);
  const rawStar = await mk('Raw Star', raw.divisionId);

  await repos.progression.putTrack(track('t-promo', 'promotion', mainEvent.divisionId));
  await repos.progression.putTrack(track('t-releg', 'relegation', mainEvent.divisionId));
  const row = (playerId: string, trackId: string, progressPct: number) =>
    repos.progression.upsertPlayerProgression({
      playerId,
      trackId,
      progressPct,
      goals: [],
      computedAt: '2026-11-01T00:00:00.000Z',
    });
  await row(ace, 't-promo', 100);
  await row(champ, 't-releg', 100);
  await repos.progression.setConsideration(champ, 't-releg', {
    status: 'considering',
    markedBy: 'gm',
    markedAt: '2026-11-01T00:00:00.000Z',
  });
  await row(leader, 't-promo', 40);
  await row(midcard, 't-promo', 10);

  // Leader: 1 win and 4 draws (7 points). Midcard: 2 wins (6 points). Champ: 0-3.
  // Ranking on wins would put midcard first; the season table ranks on points.
  let day = 1;
  const result = async (winner: string, loser: string, isDraw = false) => {
    const date = `2026-02-${String(day).padStart(2, '0')}T20:00:00.000Z`;
    await repos.competition.matches.create({
      matchId: `m${day}`,
      date,
      status: 'completed',
      matchFormat: 'singles',
      seasonId: season.seasonId,
      participants: [winner, loser],
      winners: isDraw ? [] : [winner],
      losers: isDraw ? [] : [loser],
      ...(isDraw ? { isDraw: true } : {}),
    });
    day += 1;
  };
  await result(leader, champ);
  for (let draw = 0; draw < 4; draw += 1) await result(leader, 'jobber', true);
  await result(midcard, champ);
  await result(midcard, champ);
  await result(rawStar, 'jobber');

  await repos.competition.championships.create({
    name: 'Main Event Title',
    type: 'singles',
    currentChampion: champ,
    divisionId: mainEvent.divisionId,
  });

  return {
    seasonId: season.seasonId,
    rawId: raw.divisionId,
    mainEventId: mainEvent.divisionId,
    nxtId: nxt.divisionId,
    ace,
    champ,
    leader,
    midcard,
    rawStar,
  };
}

describe('recommendMovement', () => {
  const base = { promotionPct: 0, relegationPct: 0, hasPromotionTrack: true, hasRelegationTrack: true };

  it('promotes at full promotion progress', () => {
    expect(recommendMovement({ ...base, promotionPct: 100 })).toBe('promote');
  });

  it('promotes the top N of the season standings', () => {
    expect(recommendMovement({ ...base, seasonRank: SEASON_REVIEW_PROMOTE_TOP_N })).toBe('promote');
    expect(recommendMovement({ ...base, seasonRank: SEASON_REVIEW_PROMOTE_TOP_N + 1 })).toBe('stay');
  });

  it('never recommends promotion without a promotion track', () => {
    expect(recommendMovement({ ...base, promotionPct: 100, seasonRank: 1, hasPromotionTrack: false })).toBe('stay');
  });

  it('relegates at full relegation progress, and promotion wins a tie', () => {
    expect(recommendMovement({ ...base, relegationPct: 100 })).toBe('relegate');
    expect(recommendMovement({ ...base, relegationPct: 100, promotionPct: 100 })).toBe('promote');
    expect(recommendMovement({ ...base, relegationPct: 100, hasRelegationTrack: false })).toBe('stay');
  });

  it('stays otherwise', () => {
    expect(recommendMovement({ ...base, promotionPct: 99, relegationPct: 99 })).toBe('stay');
  });
});

describe('rankBySeasonRecord', () => {
  it('ranks by wins then losses, shares ties and skips players without matches', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const ranks = rankBySeasonRecord([
      { seasonId: 's', playerId: 'a', wins: 5, losses: 1, draws: 0, updatedAt: at },
      { seasonId: 's', playerId: 'b', wins: 5, losses: 1, draws: 0, updatedAt: at },
      { seasonId: 's', playerId: 'c', wins: 5, losses: 2, draws: 0, updatedAt: at },
      { seasonId: 's', playerId: 'd', wins: 0, losses: 0, draws: 0, updatedAt: at },
    ]);
    expect(Object.fromEntries(ranks)).toEqual({ a: 1, b: 1, c: 3 });
  });
});

describe('season movement review (DMV-03)', () => {
  let fx: Fixture;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockInvokeAsync.mockResolvedValue(undefined);
    state.repos = buildInMemoryRepositories();
    fx = await seed();
  });

  it('creates the snapshot when the season-end invoke arrives', async () => {
    const res = (await handler(
      { action: 'seasonSnapshot', seasonId: fx.seasonId } as unknown as APIGatewayProxyEvent,
      ctx,
      cb,
    )) as APIGatewayProxyResult;
    expect(res.statusCode).toBe(200);

    const reviews = await state.repos.progression.listSeasonReviews(fx.seasonId);
    const byPlayer = new Map(reviews.map((review) => [review.playerId, review]));
    // Only divisions with a movement track are reviewed.
    expect(byPlayer.has(fx.rawStar)).toBe(false);
    expect(byPlayer.size).toBe(4);

    expect(byPlayer.get(fx.ace)).toMatchObject({
      divisionId: fx.mainEventId,
      promotionTrackId: 't-promo',
      promotionPct: 100,
      relegationTrackId: 't-releg',
      relegationPct: 0,
      flagged: false,
      recommendation: 'promote',
    });
    expect(byPlayer.get(fx.ace)?.seasonRank).toBeUndefined();
    expect(byPlayer.get(fx.champ)).toMatchObject({ relegationPct: 100, flagged: true, recommendation: 'relegate', seasonRank: 3 });
    expect(byPlayer.get(fx.leader)).toMatchObject({ promotionPct: 40, seasonRank: 1, recommendation: 'promote' });
    expect(byPlayer.get(fx.midcard)).toMatchObject({ seasonRank: 2, recommendation: 'stay' });
    expect(byPlayer.get(fx.midcard)?.decision).toBeUndefined();
  });

  it('keeps decided reviews when the snapshot runs again', async () => {
    await snapshotSeasonReviews(fx.seasonId);
    const decided = await state.repos.progression.getSeasonReview(fx.seasonId, fx.midcard);
    await state.repos.progression.putSeasonReview({ ...decided!, decision: 'stay', decidedBy: 'gm', decidedAt: 'x' });

    const result = await snapshotSeasonReviews(fx.seasonId);

    expect(result).toEqual({ seasonId: fx.seasonId, created: 3, keptDecided: 1 });
    expect((await state.repos.progression.getSeasonReview(fx.seasonId, fx.midcard))?.decision).toBe('stay');
  });

  it('keeps review rows out of the progression event reads', async () => {
    await snapshotSeasonReviews(fx.seasonId);
    expect(await state.repos.progression.listRecentEvents()).toEqual([]);
    expect(await state.repos.progression.listEventsByType('executed')).toEqual([]);
  });

  it('GET lists the reviews with names and move-target previews', async () => {
    await snapshotSeasonReviews(fx.seasonId);

    const res = await getReviews(fx.seasonId);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.seasonId).toBe(fx.seasonId);
    const ace = body.reviews.find((review: { playerId: string }) => review.playerId === fx.ace);
    expect(ace).toMatchObject({
      playerName: 'Ace',
      currentDivisionId: fx.mainEventId,
      targets: {
        promote: { ok: true, toDivisionId: fx.rawId },
        relegate: { ok: true, toDivisionId: fx.nxtId },
      },
    });
  });

  it('GET returns 404 for an unknown season and 403 for a non-staff caller', async () => {
    expect((await getReviews('missing')).statusCode).toBe(404);
    expect((await getReviews(fx.seasonId, 'Wrestler')).statusCode).toBe(403);
  });

  it('applies a batch through executeProgressionMove and reports per-player results', async () => {
    await snapshotSeasonReviews(fx.seasonId);

    const res = await apply(fx.seasonId, {
      decisions: [
        { playerId: fx.ace, decision: 'promote', announce: false },
        { playerId: fx.champ, decision: 'relegate' },
        { playerId: fx.midcard, decision: 'stay' },
        { playerId: fx.rawStar, decision: 'promote' },
      ],
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ seasonId: fx.seasonId, applied: 2, failed: 2 });
    const [ace, champ, midcard, rawStar] = body.results;
    expect(ace).toMatchObject({
      playerId: fx.ace,
      ok: true,
      move: { kind: 'promotion', fromDivisionId: fx.mainEventId, toDivisionId: fx.rawId },
    });
    expect(champ).toMatchObject({ playerId: fx.champ, ok: false, refusal: { status: 409, details: { code: 'HOLDS_DIVISION_TITLE' } } });
    expect(midcard).toMatchObject({ playerId: fx.midcard, decision: 'stay', ok: true });
    expect(rawStar).toMatchObject({ ok: false, refusal: { status: 404, details: { code: 'REVIEW_NOT_FOUND' } } });

    // The moves happened, and the decisions are stored only for successes.
    expect((await state.repos.roster.players.findById(fx.ace))?.divisionId).toBe(fx.rawId);
    expect((await state.repos.roster.players.findById(fx.champ))?.divisionId).toBe(fx.mainEventId);
    const stored = new Map(
      (await state.repos.progression.listSeasonReviews(fx.seasonId)).map((review) => [review.playerId, review]),
    );
    expect(stored.get(fx.ace)).toMatchObject({ decision: 'promote', decidedBy: 'sub-gm', toDivisionId: fx.rawId });
    expect(stored.get(fx.midcard)).toMatchObject({ decision: 'stay', decidedBy: 'sub-gm' });
    expect(stored.get(fx.champ)?.decision).toBeUndefined();

    // One contender recalculation for the batch, none per move.
    const contenderCalls = mockInvokeAsync.mock.calls.filter(([name]) => name === 'contenders');
    expect(contenderCalls).toEqual([['contenders', { source: 'seasonReview' }]]);

    // Retrying the forced relegation works; re-applying the promotion is refused.
    const retry = JSON.parse((await apply(fx.seasonId, {
      decisions: [
        { playerId: fx.champ, decision: 'relegate', force: true },
        { playerId: fx.ace, decision: 'promote' },
      ],
    })).body);
    expect(retry.results[0]).toMatchObject({ ok: true, move: { toDivisionId: fx.nxtId } });
    expect(retry.results[1]).toMatchObject({ ok: false, refusal: { status: 409, details: { code: 'ALREADY_APPLIED' } } });
  });

  it('rejects an invalid batch', async () => {
    expect((await apply(fx.seasonId, { decisions: [] })).statusCode).toBe(400);
    expect((await apply(fx.seasonId, { decisions: [{ playerId: fx.ace, decision: 'fire' }] })).statusCode).toBe(400);
    expect((await apply(fx.seasonId, {
      decisions: [{ playerId: fx.ace, decision: 'stay' }, { playerId: fx.ace, decision: 'promote' }],
    })).statusCode).toBe(400);
    expect((await apply('missing', { decisions: [{ playerId: fx.ace, decision: 'stay' }] })).statusCode).toBe(404);
  });
});
