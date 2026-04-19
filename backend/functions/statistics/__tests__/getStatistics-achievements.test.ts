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
    players: { list: mockPlayersList },
    matches: { list: mockMatchesList },
    championships: { listAllHistory: mockChampionshipsListAllHistory, list: mockChampionshipsList },
    matchTypes: { list: mockMatchTypesList },
    stipulations: { list: mockStipulationsList },
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

const player1 = makePlayer('p1', 'Player One', 'Wrestler A');
const player2 = makePlayer('p2', 'Player Two', 'Wrestler B');

function setupDefaultMocks(players: unknown[] = [], matches: unknown[] = [], champHistory: unknown[] = [], championships: unknown[] = []) {
  mockPlayersList.mockResolvedValue(players);
  mockMatchesList.mockResolvedValue(matches);
  mockChampionshipsListAllHistory.mockResolvedValue(champHistory);
  mockChampionshipsList.mockResolvedValue(championships);
  mockMatchTypesList.mockResolvedValue([]);
  mockStipulationsList.mockResolvedValue([]);
}

// ─── Achievements Section ────────────────────────────────────────────

describe('getStatistics - achievements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all 18 achievement definitions and player list when no playerId specified', async () => {
    setupDefaultMocks([player1, player2], []);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.players).toHaveLength(2);
    expect(body.allAchievements).toHaveLength(18);
    expect(body.achievements).toBeUndefined();

    // Verify achievement types are correct
    const types = new Set(body.allAchievements.map((a: Record<string, unknown>) => a.achievementType));
    expect(types).toContain('milestone');
    expect(types).toContain('record');
    expect(types).toContain('special');
  });

  it('awards milestone achievements: First Victory (a1), Double Digits (a2), Half Century (a3)', async () => {
    // Create 50 wins for p1
    const matches = Array.from({ length: 50 }, (_, i) =>
      makeMatch({
        matchId: `m${i}`,
        date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
        participants: ['p1', 'p2'],
        winners: ['p1'],
        losers: ['p2'],
      })
    );

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    expect(ids).toContain('a1'); // First Victory (1+ wins)
    expect(ids).toContain('a2'); // Double Digits (10+ wins)
    expect(ids).toContain('a3'); // Half Century (50+ wins)
  });

  it('awards Century Mark (a4) and Iron Man (a5) at 100 matches played', async () => {
    // 60 wins + 40 losses = 100 matches
    const winMatches = Array.from({ length: 60 }, (_, i) =>
      makeMatch({
        matchId: `w${i}`,
        date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
        participants: ['p1', 'p2'],
        winners: ['p1'],
        losers: ['p2'],
      })
    );
    const lossMatches = Array.from({ length: 40 }, (_, i) =>
      makeMatch({
        matchId: `l${i}`,
        date: `2024-02-${String((i % 28) + 1).padStart(2, '0')}`,
        participants: ['p1', 'p2'],
        winners: ['p2'],
        losers: ['p1'],
      })
    );

    setupDefaultMocks([player1, player2], [...winMatches, ...lossMatches], [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    expect(ids).toContain('a4'); // Century Mark
    expect(ids).toContain('a5'); // Iron Man
  });

  it('awards Best in the World (a18) at 10+ win streak and Unstoppable Force (a6) at 15+', async () => {
    // 15 consecutive wins for p1
    const matches = Array.from({ length: 15 }, (_, i) =>
      makeMatch({
        matchId: `m${i}`,
        date: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        participants: ['p1', 'p2'],
        winners: ['p1'],
        losers: ['p2'],
      })
    );

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    expect(ids).toContain('a18'); // Best in the World (10+ streak)
    expect(ids).toContain('a6');  // Unstoppable Force (15+ streak)

    // Verify metadata on a18
    const bestInWorld = body.achievements.find((a: Record<string, unknown>) => a.achievementId === 'a18');
    expect((bestInWorld.metadata as Record<string, unknown>).streakLength).toBe(15);
  });

  it('awards Dominant Champion (a7) for 180+ day reign', async () => {
    const matches = [
      makeMatch({ participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    const champHistory = [
      { championshipId: 'c1', champion: 'p1', wonDate: '2023-01-01', lostDate: '2023-08-01', daysHeld: 212, defenses: 3 },
    ];

    const championships = [
      { championshipId: 'c1', name: 'World Title', type: 'singles' },
    ];

    setupDefaultMocks([player1, player2], matches, champHistory, championships);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    expect(ids).toContain('a7'); // Dominant Champion
  });

  it('awards Title Collector (a8) for 9+ championship wins', async () => {
    // 9 championship match wins
    const matches = Array.from({ length: 9 }, (_, i) =>
      makeMatch({
        matchId: `cm${i}`,
        participants: ['p1', 'p2'],
        winners: ['p1'],
        losers: ['p2'],
        isChampionship: true,
      })
    );

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    expect(ids).toContain('a8'); // Title Collector
  });

  it('awards Grand Slam (a9) when player has held every active championship', async () => {
    const matches = [
      makeMatch({ participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    const champHistory = [
      { championshipId: 'c1', champion: 'p1', wonDate: '2024-01-01', lostDate: '2024-03-01', daysHeld: 60 },
      { championshipId: 'c2', champion: 'p1', wonDate: '2024-04-01', lostDate: '2024-06-01', daysHeld: 61 },
    ];

    const championships = [
      { championshipId: 'c1', name: 'World Title', type: 'singles' },
      { championshipId: 'c2', name: 'IC Title', type: 'singles' },
    ];

    setupDefaultMocks([player1, player2], matches, champHistory, championships);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    expect(ids).toContain('a9'); // Grand Slam
  });

  it('does not award Grand Slam when player is missing one active championship', async () => {
    const matches = [
      makeMatch({ participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    const champHistory = [
      { championshipId: 'c1', champion: 'p1', wonDate: '2024-01-01', lostDate: '2024-03-01', daysHeld: 60 },
      // No c2 history for p1
    ];

    const championships = [
      { championshipId: 'c1', name: 'World Title', type: 'singles' },
      { championshipId: 'c2', name: 'IC Title', type: 'singles' },
    ];

    setupDefaultMocks([player1, player2], matches, champHistory, championships);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    expect(ids).not.toContain('a9');
  });

  it('does not award Cage Master (a12) because categorization is now format-only', async () => {
    // With format-only categorization, stipulationId no longer maps matches to the 'cage' category.
    // All Singles-format matches are categorized as 'singles', so cage wins are always 0.
    const matches = Array.from({ length: 5 }, (_, i) =>
      makeMatch({
        matchId: `cage${i}`,
        matchFormat: 'Singles',
        stipulationId: 'stip-cage-1',
        participants: ['p1', 'p2'],
        winners: ['p1'],
        losers: ['p2'],
      })
    );

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    // Cage Master cannot be earned since no matches categorize as 'cage' anymore
    expect(ids).not.toContain('a12');
  });

  it('awards Deadman Walking (a13) when player wins after a 4+ loss streak', async () => {
    // p1 loses 4 in a row then wins
    const matches = [
      makeMatch({ matchId: 'l1', date: '2024-01-01', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'l2', date: '2024-02-01', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'l3', date: '2024-03-01', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'l4', date: '2024-04-01', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'w1', date: '2024-05-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    expect(ids).toContain('a13'); // Deadman Walking
  });

  it('does not award Deadman Walking when loss streak is only 3', async () => {
    // p1 loses 3 in a row then wins - not enough for a13
    const matches = [
      makeMatch({ matchId: 'l1', date: '2024-01-01', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'l2', date: '2024-02-01', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'l3', date: '2024-03-01', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'w1', date: '2024-04-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    expect(ids).not.toContain('a13');
  });

  it('awards Peoples Champion (a15) for holding 3 different championships', async () => {
    const matches = [
      makeMatch({ participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    const champHistory = [
      { championshipId: 'c1', champion: 'p1', wonDate: '2024-01-01', lostDate: '2024-02-01', daysHeld: 31 },
      { championshipId: 'c2', champion: 'p1', wonDate: '2024-03-01', lostDate: '2024-04-01', daysHeld: 31 },
      { championshipId: 'c3', champion: 'p1', wonDate: '2024-05-01', lostDate: '2024-06-01', daysHeld: 31 },
    ];

    const championships = [
      { championshipId: 'c1', name: 'World Title', type: 'singles' },
      { championshipId: 'c2', name: 'IC Title', type: 'singles' },
      { championshipId: 'c3', name: 'US Title', type: 'singles' },
    ];

    setupDefaultMocks([player1, player2], matches, champHistory, championships);

    const event = makeEvent({
      queryStringParameters: { section: 'achievements', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const ids = body.achievements.map((a: Record<string, unknown>) => a.achievementId);

    expect(ids).toContain('a15'); // Peoples Champion
  });
});

// ─── Helper Function Tests (via handler integration) ─────────────────

describe('getStatistics - helper functions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('categorizeMatch maps Singles matches with stipulationId to singles (not ladder)', async () => {
    // With format-only categorization, stipulationId does not affect the category.
    // A Singles-format match with a ladder stipulationId is categorized as 'singles'.
    const matches = [
      makeMatch({ matchId: 'm1', matchFormat: 'Singles', stipulationId: 'stip-ladder-1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    // Should count in singles, not ladder
    const singlesStats = body.statistics.find((s: Record<string, unknown>) => s.statType === 'singles');
    expect(singlesStats.wins).toBe(1);
    expect(singlesStats.matchesPlayed).toBe(1);
    const ladderStats = body.statistics.find((s: Record<string, unknown>) => s.statType === 'ladder');
    expect(ladderStats.wins).toBe(0);
    expect(ladderStats.matchesPlayed).toBe(0);
  });

  it('categorizeMatch maps Singles matches with cage stipulationId to singles (not cage)', async () => {
    // With format-only categorization, stipulationId does not affect the category.
    // Singles-format matches with cage-related stipulationIds are categorized as 'singles'.
    const matches = [
      makeMatch({ matchId: 'm1', matchFormat: 'Singles', stipulationId: 'stip-cage-1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', matchFormat: 'Singles', stipulationId: 'stip-hiac-1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm3', matchFormat: 'Singles', stipulationId: 'stip-hiac-2', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    // Should count in singles, not cage
    const singlesStats = body.statistics.find((s: Record<string, unknown>) => s.statType === 'singles');
    expect(singlesStats.wins).toBe(3);
    expect(singlesStats.matchesPlayed).toBe(3);
    const cageStats = body.statistics.find((s: Record<string, unknown>) => s.statType === 'cage');
    expect(cageStats.wins).toBe(0);
    expect(cageStats.matchesPlayed).toBe(0);
  });

  it('categorizeMatch maps tag match type correctly', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', matchFormat: 'Tag Team', participants: ['p1', 'p2', 'p3'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', matchFormat: '6-Man Tag', participants: ['p1', 'p2', 'p3'], winners: ['p1'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const tagStats = body.statistics.find((s: Record<string, unknown>) => s.statType === 'tag');
    expect(tagStats.wins).toBe(2);
    expect(tagStats.matchesPlayed).toBe(2);
  });

  it('computeStreaks correctly tracks current and longest win/loss streaks', async () => {
    // p1 pattern: W, W, W, L, W, W = longest win 3, current win 2, longest loss 1
    const matches = [
      makeMatch({ matchId: 'm1', date: '2024-01-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', date: '2024-02-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm3', date: '2024-03-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm4', date: '2024-04-01', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'm5', date: '2024-05-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm6', date: '2024-06-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const overall = body.statistics.find((s: Record<string, unknown>) => s.statType === 'overall');

    expect(overall.longestWinStreak).toBe(3);
    expect(overall.currentWinStreak).toBe(2);
    expect(overall.longestLossStreak).toBe(1);
  });

  it('computePlayerStatistics correctly calculates winPercentage and date range', async () => {
    // p1: 3 wins, 1 loss, 1 draw = 60% win rate
    const matches = [
      makeMatch({ matchId: 'm1', date: '2024-01-15', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', date: '2024-03-15', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm3', date: '2024-05-15', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm4', date: '2024-07-15', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      // Draw: both in participants but neither in winners/losers
      makeMatch({ matchId: 'm5', date: '2024-09-15', participants: ['p1', 'p2'], winners: undefined, losers: undefined }),
      // Pending match should be excluded
      makeMatch({ matchId: 'm6', date: '2024-10-15', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'pending' }),
    ];

    setupDefaultMocks([player1, player2], matches, [], []);

    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: 'p1' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const overall = body.statistics.find((s: Record<string, unknown>) => s.statType === 'overall');

    expect(overall.wins).toBe(3);
    expect(overall.losses).toBe(1);
    expect(overall.draws).toBe(1);
    expect(overall.matchesPlayed).toBe(5);
    expect(overall.winPercentage).toBe(60);
    expect(overall.firstMatchDate).toBe('2024-01-15');
    expect(overall.lastMatchDate).toBe('2024-09-15');
  });
});
