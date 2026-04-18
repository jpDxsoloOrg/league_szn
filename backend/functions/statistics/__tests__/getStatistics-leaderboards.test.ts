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

const player1 = makePlayer('p1', 'Alpha', 'Wrestler A');
const player2 = makePlayer('p2', 'Beta', 'Wrestler B');
const player3 = makePlayer('p3', 'Gamma', 'Wrestler C');

function setupDefaultMocks(players: unknown[] = [], matches: unknown[] = [], champHistory: unknown[] = []) {
  mockPlayersList.mockResolvedValue(players);
  mockMatchesList.mockResolvedValue(matches);
  mockChampionshipsListAllHistory.mockResolvedValue(champHistory);
  mockChampionshipsList.mockResolvedValue([]);
  mockMatchTypesList.mockResolvedValue([]);
  mockStipulationsList.mockResolvedValue([]);
}

// ─── Leaderboards Section ────────────────────────────────────────────

describe('getStatistics - leaderboards', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ranks players by most wins correctly', async () => {
    // p1: 3 wins, p2: 1 win, p3: 0 wins
    const matches = [
      makeMatch({ matchId: 'm1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm3', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm4', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
    ];

    setupDefaultMocks([player1, player2, player3], matches, []);

    const event = makeEvent({
      queryStringParameters: { section: 'leaderboards' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const mostWins = body.leaderboards.mostWins;

    expect(mostWins[0].playerName).toBe('Alpha');
    expect(mostWins[0].value).toBe(3);
    expect(mostWins[0].rank).toBe(1);
    expect(mostWins[1].playerName).toBe('Beta');
    expect(mostWins[1].value).toBe(1);
    expect(mostWins[1].rank).toBe(2);
    expect(mostWins[2].value).toBe(0);
    expect(mostWins[2].rank).toBe(3);
  });

  it('ranks best win percentage filtering out players with zero matches', async () => {
    // p1: 2 wins / 3 matches = 66.7%, p2: 1 win / 1 match = 100%, p3: 0 matches
    const matches = [
      makeMatch({ matchId: 'm1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm3', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
    ];

    setupDefaultMocks([player1, player2, player3], matches, []);

    const event = makeEvent({
      queryStringParameters: { section: 'leaderboards' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const bestWinPct = body.leaderboards.bestWinPercentage;

    // p2: 1W 1L = 50%, p1: 2W 1L = 66.7%, p3: 0W 1L = 0%
    // Sorted: p1 (66.7%), p2 (50%), p3 (0%)
    expect(bestWinPct[0].playerName).toBe('Alpha');
    expect(bestWinPct[0].value).toBe(66.7);
    expect(bestWinPct[1].playerName).toBe('Beta');
    expect(bestWinPct[1].value).toBe(50);
  });

  it('ranks longest win streak correctly', async () => {
    // p1 wins 3 in a row, p2 never wins consecutively
    const matches = [
      makeMatch({ matchId: 'm1', date: '2024-01-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', date: '2024-02-01', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm3', date: '2024-03-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm4', date: '2024-04-01', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
    ];

    setupDefaultMocks([player1, player2, player3], matches, []);

    const event = makeEvent({
      queryStringParameters: { section: 'leaderboards' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const longestStreak = body.leaderboards.longestStreak;

    expect(longestStreak[0].playerName).toBe('Alpha');
    expect(longestStreak[0].value).toBe(3);
    expect(longestStreak[0].rank).toBe(1);
  });

  it('ranks most championships by championship wins', async () => {
    // p1: 2 championship wins, p2: 1, p3: 0
    const matches = [
      makeMatch({ matchId: 'm1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], isChampionship: true }),
      makeMatch({ matchId: 'm2', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'], isChampionship: true }),
      makeMatch({ matchId: 'm3', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'], isChampionship: true }),
    ];

    setupDefaultMocks([player1, player2, player3], matches, []);

    const event = makeEvent({
      queryStringParameters: { section: 'leaderboards' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const mostChamps = body.leaderboards.mostChampionships;

    expect(mostChamps[0].playerName).toBe('Alpha');
    expect(mostChamps[0].value).toBe(2);
    expect(mostChamps[1].playerName).toBe('Beta');
    expect(mostChamps[1].value).toBe(1);
  });

  it('ranks longest reign using championship history days', async () => {
    const champHistory = [
      { championshipId: 'c1', champion: 'p1', wonDate: '2024-01-01', lostDate: '2024-06-01', daysHeld: 152 },
      { championshipId: 'c1', champion: 'p2', wonDate: '2024-06-01', lostDate: '2024-07-01', daysHeld: 30 },
      { championshipId: 'c2', champion: 'p3', wonDate: '2024-01-01', lostDate: '2024-02-01', daysHeld: 31 },
    ];

    setupDefaultMocks([player1, player2, player3], [], champHistory);

    const event = makeEvent({
      queryStringParameters: { section: 'leaderboards' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const longestReign = body.leaderboards.longestReign;

    expect(longestReign[0].playerName).toBe('Alpha');
    expect(longestReign[0].value).toBe(152);
    expect(longestReign[0].rank).toBe(1);
    expect(longestReign[1].playerName).toBe('Gamma');
    expect(longestReign[1].value).toBe(31);
    expect(longestReign[2].playerName).toBe('Beta');
    expect(longestReign[2].value).toBe(30);
  });
});

// ─── Records Section ─────────────────────────────────────────────────

describe('getStatistics - records', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes overall records including most wins, highest win%, most matches, fewest losses', async () => {
    // p1: 8 wins, 2 losses = 80% (10 matches)
    // p2: 5 wins, 5 losses = 50% (10 matches)
    // p3: 3 wins, 2 losses = 60% (5 matches, below 5-match threshold for win%, below 10 for fewest losses)
    const matches: ReturnType<typeof makeMatch>[] = [];
    // p1 vs p2: p1 wins 5 times
    for (let i = 0; i < 5; i++) {
      matches.push(makeMatch({ matchId: `a${i}`, date: `2024-01-${String(i + 1).padStart(2, '0')}`, participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }));
    }
    // p1 vs p3: p1 wins 3 times, p3 wins 2 times
    for (let i = 0; i < 3; i++) {
      matches.push(makeMatch({ matchId: `b${i}`, date: `2024-02-${String(i + 1).padStart(2, '0')}`, participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }));
    }
    for (let i = 0; i < 2; i++) {
      matches.push(makeMatch({ matchId: `c${i}`, date: `2024-03-${String(i + 1).padStart(2, '0')}`, participants: ['p1', 'p3'], winners: ['p3'], losers: ['p1'] }));
    }
    // p2 vs p3: p2 wins 5 times
    for (let i = 0; i < 5; i++) {
      matches.push(makeMatch({ matchId: `d${i}`, date: `2024-04-${String(i + 1).padStart(2, '0')}`, participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }));
    }

    setupDefaultMocks([player1, player2, player3], matches, []);

    const event = makeEvent({
      queryStringParameters: { section: 'records' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);

    // Overall records
    const overallRecords = body.records.overall;
    expect(overallRecords).toHaveLength(4);

    // Most Career Wins: p1 with 8
    expect(overallRecords[0].recordName).toBe('Most Career Wins');
    expect(overallRecords[0].holderName).toBe('Alpha');
    expect(overallRecords[0].value).toBe(8);

    // Highest Win Percentage (min 5 matches): p1 with 80%
    expect(overallRecords[1].recordName).toBe('Highest Win Percentage');
    expect(overallRecords[1].holderName).toBe('Alpha');
    expect(overallRecords[1].value).toBe('80%');

    // Most Matches Played: p1 with 10
    expect(overallRecords[2].recordName).toBe('Most Matches Played');
    expect(overallRecords[2].value).toBe(10);

    // Fewest Losses (10+ matches): p1 with 2, p2 with 5. p3 has <10 matches so excluded
    expect(overallRecords[3].recordName).toBe('Fewest Losses (10+ matches)');
    expect(overallRecords[3].holderName).toBe('Alpha');
    expect(overallRecords[3].value).toBe(2);
  });

  it('computes championship records including longest reign and most defenses', async () => {
    const matches = [
      makeMatch({ participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], isChampionship: true }),
      makeMatch({ participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'], isChampionship: true }),
    ];

    const champHistory = [
      { championshipId: 'c1', champion: 'p1', wonDate: '2024-01-01', lostDate: '2024-07-01', daysHeld: 182, defenses: 5 },
      { championshipId: 'c1', champion: 'p2', wonDate: '2024-07-01', lostDate: '2024-08-01', daysHeld: 31, defenses: 1 },
    ];

    setupDefaultMocks([player1, player2, player3], matches, champHistory);

    const event = makeEvent({
      queryStringParameters: { section: 'records' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);

    const champRecords = body.records.championships;
    expect(champRecords).toHaveLength(4);

    // Longest Single Reign: p1 with 182 days
    const longestReign = champRecords.find((r: Record<string, unknown>) => r.recordName === 'Longest Single Reign');
    expect(longestReign.holderName).toBe('Alpha');
    expect(longestReign.value).toBe('182 days');

    // Most Title Defenses: p1 with 5
    const mostDefenses = champRecords.find((r: Record<string, unknown>) => r.recordName === 'Most Title Defenses');
    expect(mostDefenses.holderName).toBe('Alpha');
    expect(mostDefenses.value).toBe(5);

    // Most Defenses in Single Reign: p1 with 5
    const mostDefSingleReign = champRecords.find((r: Record<string, unknown>) => r.recordName === 'Most Defenses in Single Reign');
    expect(mostDefSingleReign.value).toBe(5);
  });

  it('computes streak records including longest win streak and longest loss streak', async () => {
    // p1: wins 4 in a row, then loses 1
    // p2: loses 3 in a row, then wins 2
    const matches = [
      makeMatch({ matchId: 'm1', date: '2024-01-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', date: '2024-02-01', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm3', date: '2024-03-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm4', date: '2024-04-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm5', date: '2024-05-01', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'm6', date: '2024-06-01', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
    ];

    setupDefaultMocks([player1, player2, player3], matches, []);

    const event = makeEvent({
      queryStringParameters: { section: 'records' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);

    const streakRecords = body.records.streaks;
    expect(streakRecords).toHaveLength(4);

    // Longest Win Streak: p1 with 4
    const longestWin = streakRecords.find((r: Record<string, unknown>) => r.recordName === 'Longest Win Streak');
    expect(longestWin.holderName).toBe('Alpha');
    expect(longestWin.value).toBe(4);

    // Longest Loss Streak: p2 with 3
    const longestLoss = streakRecords.find((r: Record<string, unknown>) => r.recordName === 'Longest Loss Streak');
    expect(longestLoss.value).toBe(3);
  });

  it('computes match type records (singles, tag, cage, ladder)', async () => {
    // With format-only categorization, stipulationId no longer affects match type.
    // All 'Singles' format matches are categorized as 'singles' regardless of stipulationId.
    const matches = [
      // Singles wins: p1 has 2, p2 has 1
      makeMatch({ matchId: 's1', matchFormat: 'Singles', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 's2', matchFormat: 'Singles', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 's3', matchFormat: 'Singles', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
      // Tag wins: p2 has 2
      makeMatch({ matchId: 't1', matchFormat: 'Tag Team', participants: ['p1', 'p2', 'p3'], winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 't2', matchFormat: 'Tag Team', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
      // These have stipulationId but matchFormat 'Singles', so they count as singles now
      makeMatch({ matchId: 'c1', matchFormat: 'Singles', stipulationId: 'stip-cage-1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'c2', matchFormat: 'Singles', stipulationId: 'stip-cage-2', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'c3', matchFormat: 'Singles', stipulationId: 'stip-cage-1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'l1', matchFormat: 'Singles', stipulationId: 'stip-ladder-1', participants: ['p1', 'p3'], winners: ['p3'], losers: ['p1'] }),
      makeMatch({ matchId: 'l2', matchFormat: 'Singles', stipulationId: 'stip-ladder-1', participants: ['p2', 'p3'], winners: ['p3'], losers: ['p2'] }),
    ];

    setupDefaultMocks([player1, player2, player3], matches, []);

    const event = makeEvent({
      queryStringParameters: { section: 'records' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);

    const matchTypeRecords = body.records.matchTypes;
    expect(matchTypeRecords).toHaveLength(4);

    // All Singles-format matches (including those with cage/ladder stipulationId) are now singles
    const singlesRecord = matchTypeRecords.find((r: Record<string, unknown>) => r.recordName === 'Most Singles Wins');
    expect(singlesRecord.holderName).toBe('Alpha');
    expect(singlesRecord.value).toBe(5);

    const tagRecord = matchTypeRecords.find((r: Record<string, unknown>) => r.recordName === 'Most Tag Team Wins');
    expect(tagRecord.holderName).toBe('Beta');
    expect(tagRecord.value).toBe(2);

    // No matches categorize as cage or ladder anymore (format-only categorization)
    const cageRecord = matchTypeRecords.find((r: Record<string, unknown>) => r.recordName === 'Best Cage Match Record');
    expect(cageRecord.holderName).toBe('N/A');
    expect(cageRecord.value).toBe('0%');

    // mostLadderWins returns first player with 0 wins (all tied at 0)
    const ladderRecord = matchTypeRecords.find((r: Record<string, unknown>) => r.recordName === 'Most Ladder Match Wins');
    expect(ladderRecord.value).toBe(0);
  });

  it('generates active threats showing runner-ups close to breaking records', async () => {
    // p1: 5 wins, p2: 4 wins => 1 win behind
    const matches = [
      makeMatch({ matchId: 'm1', date: '2024-01-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', date: '2024-02-01', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm3', date: '2024-03-01', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm4', date: '2024-04-01', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm5', date: '2024-05-01', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm6', date: '2024-06-01', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
      makeMatch({ matchId: 'm7', date: '2024-07-01', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
      makeMatch({ matchId: 'm8', date: '2024-08-01', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
      makeMatch({ matchId: 'm9', date: '2024-09-01', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'] }),
    ];

    setupDefaultMocks([player1, player2, player3], matches, []);

    const event = makeEvent({
      queryStringParameters: { section: 'records' },
    });

    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);

    expect(body.activeThreats).toBeDefined();
    expect(Array.isArray(body.activeThreats)).toBe(true);

    // Should have at least "Most Career Wins" threat
    const winsThread = body.activeThreats.find((t: Record<string, unknown>) => t.recordName === 'Most Career Wins');
    expect(winsThread).toBeDefined();
    expect(winsThread.currentValue).toBe(5);
    expect(winsThread.threatValue).toBe(4);
    expect(winsThread.gapDescription).toBe('1 wins behind');

    // Should have "Longest Win Streak" threat since p2 has active streak of 4
    const streakThreat = body.activeThreats.find((t: Record<string, unknown>) => t.recordName === 'Longest Win Streak');
    expect(streakThreat).toBeDefined();
    expect(streakThreat.threatValue).toBe('5 active');
  });
});
