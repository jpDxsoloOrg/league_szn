import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockPlayersList, mockMatchesList, mockChampionshipsListAllHistory, mockChampionshipsList, mockMatchTypesList, mockStipulationsList } = vi.hoisted(() => ({
  mockPlayersList: vi.fn(),
  mockMatchesList: vi.fn(),
  mockChampionshipsListAllHistory: vi.fn(),
  mockChampionshipsList: vi.fn(),
  mockMatchTypesList: vi.fn(),
  mockStipulationsList: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: { players: { list: mockPlayersList } },
    competition: {
      matches: { list: mockMatchesList },
      championships: { listAllHistory: mockChampionshipsListAllHistory, list: mockChampionshipsList },
      matchTypes: { list: mockMatchTypesList },
      stipulations: { list: mockStipulationsList },
    },
  }),
}));

import { handler } from '../getStatistics';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/statistics',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function makePlayer(id: string, name: string, wrestler: string) {
  return {
    playerId: id,
    name,
    currentWrestler: wrestler,
    wins: 0,
    losses: 0,
    draws: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    matchId: `m-${Math.random().toString(36).slice(2, 8)}`,
    date: '2024-06-15',
    matchFormat: 'Singles',
    participants: ['p1', 'p2'],
    winners: ['p1'],
    losers: ['p2'],
    isChampionship: false,
    status: 'completed',
    ...overrides,
  };
}

// Base players for reuse
const player1 = makePlayer('p1', 'Player One', 'Wrestler A');
const player2 = makePlayer('p2', 'Player Two', 'Wrestler B');
const player3 = makePlayer('p3', 'Player Three', 'Wrestler C');

function setupDefaultMocks(players: unknown[] = [], matches: unknown[] = [], champHistory: unknown[] = [], championships: unknown[] = []) {
  mockPlayersList.mockResolvedValue(players);
  mockMatchesList.mockResolvedValue(matches);
  mockChampionshipsListAllHistory.mockResolvedValue(champHistory);
  mockChampionshipsList.mockResolvedValue(championships);
  mockMatchTypesList.mockResolvedValue([]);
  mockStipulationsList.mockResolvedValue([]);
}

// ─── Validation Tests ────────────────────────────────────────────────

describe('getStatistics - Validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when section query parameter is missing', async () => {
    const event = makeEvent({ queryStringParameters: null });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Missing required query parameter: section');
  });

  it('returns 400 for an unknown section value', async () => {
    setupDefaultMocks([player1], []);

    const event = makeEvent({
      queryStringParameters: { section: 'invalid-section' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Unknown section: invalid-section');
  });

  it('returns player list without stats when head-to-head is missing player IDs', async () => {
    setupDefaultMocks([player1, player2], []);

    const event = makeEvent({
      queryStringParameters: { section: 'head-to-head' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players).toHaveLength(2);
    expect(body.headToHead).toBeUndefined();
  });
});

// ─── player-stats Section ────────────────────────────────────────────

describe('getStatistics - player-stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only player list when no playerId is specified', async () => {
    setupDefaultMocks([player1, player2], []);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players).toHaveLength(2);
    expect(body.players[0]).toMatchObject({
      playerId: 'p1',
      name: 'Player One',
      wrestlerName: 'Wrestler A',
    });
    expect(body.statistics).toBeUndefined();
  });

  it('computes stats for all 5 match types (overall, singles, tag, ladder, cage)', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', matchFormat: 'Singles', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', matchFormat: 'Tag Team', participants: ['p1', 'p2', 'p3'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm3', matchFormat: 'Singles', stipulationId: 'stip-1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm4', matchFormat: 'Singles', stipulationId: 'stip-2', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'm5', matchFormat: 'Singles', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.statistics).toHaveLength(5);

    const statTypes = body.statistics.map((s: Record<string, unknown>) => s.statType);
    expect(statTypes).toEqual(['overall', 'singles', 'tag', 'ladder', 'cage']);

    // overall: 4 wins, 1 loss
    const overall = body.statistics.find((s: Record<string, unknown>) => s.statType === 'overall');
    expect(overall.wins).toBe(4);
    expect(overall.losses).toBe(1);
    expect(overall.matchesPlayed).toBe(5);

    // singles: m1, m3, m4, m5 (all Singles format, stipulationId no longer affects categorization)
    const singles = body.statistics.find((s: Record<string, unknown>) => s.statType === 'singles');
    expect(singles.wins).toBe(3);
    expect(singles.losses).toBe(1);

    // tag: m2 = 1 win
    const tag = body.statistics.find((s: Record<string, unknown>) => s.statType === 'tag');
    expect(tag.wins).toBe(1);
    expect(tag.matchesPlayed).toBe(1);

    // ladder: categorization is now format-only, so no matches map to ladder
    const ladder = body.statistics.find((s: Record<string, unknown>) => s.statType === 'ladder');
    expect(ladder.wins).toBe(0);
    expect(ladder.matchesPlayed).toBe(0);

    // cage: categorization is now format-only, so no matches map to cage
    const cage = body.statistics.find((s: Record<string, unknown>) => s.statType === 'cage');
    expect(cage.losses).toBe(0);
    expect(cage.wins).toBe(0);
  });

  it('calculates championship history per title including days held and defenses', async () => {
    const matches = [
      makeMatch({ participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], isChampionship: true }),
    ];

    const champHistory = [
      {
        championshipId: 'c1',
        champion: 'p1',
        wonDate: '2024-01-01',
        lostDate: '2024-04-01',
        daysHeld: 91,
        defenses: 3,
      },
      {
        championshipId: 'c1',
        champion: 'p1',
        wonDate: '2024-06-01',
        lostDate: '2024-07-01',
        daysHeld: 30,
        defenses: 1,
      },
    ];

    const championships = [
      { championshipId: 'c1', name: 'World Title', type: 'singles', currentChampion: 'p2' },
    ];

    setupDefaultMocks([player1, player2], matches, champHistory, championships);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.championshipStats).toHaveLength(1);

    const champStat = body.championshipStats[0];
    expect(champStat.championshipName).toBe('World Title');
    expect(champStat.totalReigns).toBe(2);
    expect(champStat.totalDaysHeld).toBe(121);
    expect(champStat.longestReign).toBe(91);
    expect(champStat.shortestReign).toBe(30);
    expect(champStat.totalDefenses).toBe(4);
    expect(champStat.mostDefensesInReign).toBe(3);
    expect(champStat.currentlyHolding).toBe(false);
  });

  it('handles tag championship where champion is an array', async () => {
    const matches = [
      makeMatch({ matchFormat: 'Tag Team', participants: ['p1', 'p2', 'p3'], winners: ['p1', 'p2'], losers: ['p3'] }),
    ];

    const champHistory = [
      {
        championshipId: 'c-tag',
        champion: ['p1', 'p2'],
        wonDate: '2024-01-01',
        daysHeld: 60,
        defenses: 2,
      },
    ];

    const championships = [
      { championshipId: 'c-tag', name: 'Tag Titles', type: 'tag', currentChampion: ['p1', 'p2'] },
    ];

    setupDefaultMocks([player1, player2], matches, champHistory, championships);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.championshipStats).toHaveLength(1);
    expect(body.championshipStats[0].totalReigns).toBe(1);
    expect(body.championshipStats[0].currentlyHolding).toBe(true);
  });

  it('includes computed achievements in player-stats response', async () => {
    // Player with 3 wins qualifies for "First Victory" and potentially more
    const matches = [
      makeMatch({ matchId: 'm1', date: '2024-01-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', date: '2024-02-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm3', date: '2024-03-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.achievements).toBeDefined();
    expect(Array.isArray(body.achievements)).toBe(true);
    // Should at least have "First Victory" (a1)
    const firstVictory = body.achievements.find((a: Record<string, unknown>) => a.achievementId === 'a1');
    expect(firstVictory).toBeDefined();
    expect(firstVictory.achievementName).toBe('First Victory');
  });

  it('handles ongoing championship reign by computing days from wonDate to now', async () => {
    const matches = [
      makeMatch({ participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], isChampionship: true }),
    ];

    const champHistory = [
      {
        championshipId: 'c1',
        champion: 'p1',
        wonDate: '2024-01-01',
        // no lostDate, no daysHeld => ongoing reign
      },
    ];

    const championships = [
      { championshipId: 'c1', name: 'World Title', type: 'singles', currentChampion: 'p1' },
    ];

    setupDefaultMocks([player1], matches, champHistory, championships);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const champStat = body.championshipStats[0];
    // Ongoing reign: days should be > 0 since wonDate is in the past
    expect(champStat.totalDaysHeld).toBeGreaterThan(0);
    expect(champStat.currentlyHolding).toBe(true);
  });
});

// ─── head-to-head Section ────────────────────────────────────────────

describe('getStatistics - head-to-head', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes head-to-head record between two players', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', date: '2024-01-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', date: '2024-02-01', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'm3', date: '2024-03-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], isChampionship: true }),
      // This match does not include p2, should be excluded from H2H
      makeMatch({ matchId: 'm4', date: '2024-04-01', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
    ];

    setupDefaultMocks([player1, player2, player3], matches);

    const event = makeEvent({
      queryStringParameters: { section: 'head-to-head', player1Id: 'p1', player2Id: 'p2' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.headToHead).toBeDefined();
    expect(body.headToHead.player1Wins).toBe(2);
    expect(body.headToHead.player2Wins).toBe(1);
    expect(body.headToHead.draws).toBe(0);
    expect(body.headToHead.totalMatches).toBe(3);
    expect(body.headToHead.championshipMatches).toBe(1);
  });

  it('returns recent 5 results sorted by date descending', async () => {
    const matches = Array.from({ length: 7 }, (_, i) =>
      makeMatch({
        matchId: `m${i + 1}`,
        date: `2024-0${i + 1}-15`,
        participants: ['p1', 'p2'],
        winners: i % 2 === 0 ? ['p1'] : ['p2'],
        losers: i % 2 === 0 ? ['p2'] : ['p1'],
      })
    );

    setupDefaultMocks([player1, player2], matches);

    const event = makeEvent({
      queryStringParameters: { section: 'head-to-head', player1Id: 'p1', player2Id: 'p2' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.headToHead.recentResults).toHaveLength(5);
    // Most recent first (July)
    expect(body.headToHead.recentResults[0].date).toBe('2024-07-15');
    expect(body.headToHead.recentResults[4].date).toBe('2024-03-15');
  });

  it('includes overall stats for both players in head-to-head response', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm3', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
    ];

    setupDefaultMocks([player1, player2, player3], matches);

    const event = makeEvent({
      queryStringParameters: { section: 'head-to-head', player1Id: 'p1', player2Id: 'p2' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    // p1 overall: 2 wins (m1 + m2), 0 losses
    expect(body.player1Stats.wins).toBe(2);
    expect(body.player1Stats.losses).toBe(0);
    // p2 overall: 1 win (m3), 1 loss (m1)
    expect(body.player2Stats.wins).toBe(1);
    expect(body.player2Stats.losses).toBe(1);
  });

  it('returns null headToHead when two players have no matches together', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm2', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
    ];

    setupDefaultMocks([player1, player2, player3], matches);

    const event = makeEvent({
      queryStringParameters: { section: 'head-to-head', player1Id: 'p1', player2Id: 'p2' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.headToHead).toBeNull();
    // Overall stats should still be present
    expect(body.player1Stats).toBeDefined();
    expect(body.player2Stats).toBeDefined();
  });
});

// ─── seasonId Filtering ─────────────────────────────────────────────

describe('getStatistics - seasonId filtering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters match stats to only the requested season', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm3', seasonId: 's2', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'm4', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }), // no seasonId
    ];

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1', seasonId: 's1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const overall = body.statistics.find((s: Record<string, unknown>) => s.statType === 'overall');
    // Only s1 matches: m1 (win) + m2 (win) = 2 wins, 0 losses
    expect(overall.wins).toBe(2);
    expect(overall.losses).toBe(0);
    expect(overall.matchesPlayed).toBe(2);
  });

  it('filters head-to-head stats by seasonId', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', date: '2024-01-01', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', date: '2024-02-01', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'm3', date: '2024-03-01', seasonId: 's2', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1, player2], matches);

    const event = makeEvent({
      queryStringParameters: { section: 'head-to-head', player1Id: 'p1', player2Id: 'p2', seasonId: 's1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.headToHead.totalMatches).toBe(2);
    expect(body.headToHead.player1Wins).toBe(1);
    expect(body.headToHead.player2Wins).toBe(1);
  });

  it('filters leaderboard stats by seasonId', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', seasonId: 's2', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'm3', seasonId: 's2', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
    ];

    setupDefaultMocks([player1, player2], matches, []);

    const event = makeEvent({
      queryStringParameters: { section: 'leaderboards', seasonId: 's1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    // In season s1 only m1 exists: p1 has 1 win, p2 has 0 wins
    const mostWins = body.leaderboards.mostWins;
    const p1Entry = mostWins.find((e: Record<string, unknown>) => e.playerId === 'p1');
    const p2Entry = mostWins.find((e: Record<string, unknown>) => e.playerId === 'p2');
    expect(p1Entry.value).toBe(1);
    expect(p2Entry.value).toBe(0);
  });

  it('keeps championship stats all-time when seasonId is set', async () => {
    // s1 has 1 match, but championship history spans all time
    const matches = [
      makeMatch({ matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], isChampionship: true }),
    ];

    const champHistory = [
      { championshipId: 'c1', champion: 'p1', wonDate: '2024-01-01', lostDate: '2024-03-01', daysHeld: 60, defenses: 2 },
      { championshipId: 'c1', champion: 'p1', wonDate: '2024-06-01', lostDate: '2024-08-01', daysHeld: 61, defenses: 1 },
    ];

    const championships = [
      { championshipId: 'c1', name: 'World Title', type: 'singles', currentChampion: 'p2' },
    ];

    setupDefaultMocks([player1, player2], matches, champHistory, championships);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1', seasonId: 's1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);

    // Match stats should be season-filtered: 1 win only
    const overall = body.statistics.find((s: Record<string, unknown>) => s.statType === 'overall');
    expect(overall.wins).toBe(1);
    expect(overall.matchesPlayed).toBe(1);

    // Championship stats should be all-time: both reigns counted
    expect(body.championshipStats).toHaveLength(1);
    expect(body.championshipStats[0].totalReigns).toBe(2);
    expect(body.championshipStats[0].totalDaysHeld).toBe(121);
  });

  it('keeps achievements all-time when seasonId is set', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], isChampionship: true }),
    ];

    const champHistory = [
      { championshipId: 'c1', champion: 'p1', wonDate: '2024-01-01', lostDate: '2024-07-01', daysHeld: 182, defenses: 5 },
      { championshipId: 'c2', champion: 'p1', wonDate: '2024-02-01', lostDate: '2024-04-01', daysHeld: 59, defenses: 1 },
      { championshipId: 'c3', champion: 'p1', wonDate: '2024-05-01', lostDate: '2024-06-01', daysHeld: 31, defenses: 0 },
    ];

    const championships = [
      { championshipId: 'c1', name: 'World Title', type: 'singles', currentChampion: 'p2' },
      { championshipId: 'c2', name: 'IC Title', type: 'singles', currentChampion: 'p2' },
      { championshipId: 'c3', name: 'US Title', type: 'singles', currentChampion: 'p2' },
    ];

    setupDefaultMocks([player1, player2], matches, champHistory, championships);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1', seasonId: 's1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);

    // Championship-based achievements should still be earned from all-time history
    // a7: Dominant Champion (180+ day reign) - c1 has 182 days
    const dominantChamp = body.achievements.find((a: Record<string, unknown>) => a.achievementId === 'a7');
    expect(dominantChamp).toBeDefined();

    // a15: Peoples Champion (3 different championships) - held c1, c2, c3
    const peoplesChamp = body.achievements.find((a: Record<string, unknown>) => a.achievementId === 'a15');
    expect(peoplesChamp).toBeDefined();
  });

  it('returns no matches when seasonId has no matches', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1', seasonId: 'nonexistent' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const overall = body.statistics.find((s: Record<string, unknown>) => s.statType === 'overall');
    expect(overall.wins).toBe(0);
    expect(overall.losses).toBe(0);
    expect(overall.matchesPlayed).toBe(0);
  });
});

// ─── Error Handling ──────────────────────────────────────────────────

describe('getStatistics - error handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 500 when database call throws an error', async () => {
    mockPlayersList.mockRejectedValue(new Error('DynamoDB connection failed'));
    mockMatchesList.mockResolvedValue([]);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to compute statistics');
  });
});
