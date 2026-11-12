import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dynamodb before importing the calculator
const { mockScanAll, mockListTagTeams } = vi.hoisted(() => ({
  mockScanAll: vi.fn(),
  mockListTagTeams: vi.fn(),
}));

vi.mock('../repositories', () => ({
  getRepositories: () => ({
    roster: { tagTeams: { listAll: mockListTagTeams } },
  }),
}));

vi.mock('../dynamodb', () => ({
  dynamoDb: {
    scanAll: mockScanAll,
  },
  TableNames: {
    PLAYERS: 'Players',
    MATCHES: 'Matches',
  },
}));

import {
  calculatePlayerScore,
  calculateCurrentStreak,
  calculateRankingsForChampionship,
} from '../rankingCalculator';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Build a match record with sensible defaults. */
function makeMatch(overrides: {
  matchId?: string;
  date?: string;
  participants?: string[];
  winners?: string[];
  losers?: string[];
  seasonId?: string;
  teams?: string[][];
  matchFormat?: string;
  isDraw?: boolean;
}) {
  return {
    ...(overrides.teams ? { teams: overrides.teams } : {}),
    ...(overrides.matchFormat ? { matchFormat: overrides.matchFormat } : {}),
    ...(overrides.isDraw ? { isDraw: true } : {}),
    matchId: overrides.matchId ?? 'match-1',
    date: overrides.date ?? new Date().toISOString(),
    participants: overrides.participants ?? [...(overrides.winners ?? []), ...(overrides.losers ?? [])],
    winners: overrides.winners ?? [],
    losers: overrides.losers ?? [],
    status: 'completed',
    seasonId: overrides.seasonId ?? 'season-1',
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ─── calculateCurrentStreak ──────────────────────────────────────────

describe('calculateCurrentStreak', () => {
  it('returns positive number for consecutive wins (most recent first)', () => {
    const matches = [
      makeMatch({ matchId: 'm1', date: daysAgo(3), winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(1), winners: ['p1'], losers: ['p4'] }),
    ];

    expect(calculateCurrentStreak(matches, 'p1')).toBe(3);
  });

  it('returns negative number for consecutive losses', () => {
    const matches = [
      makeMatch({ matchId: 'm1', date: daysAgo(2), winners: ['p2'], losers: ['p1'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(1), winners: ['p3'], losers: ['p1'] }),
    ];

    expect(calculateCurrentStreak(matches, 'p1')).toBe(-2);
  });

  it('stops counting when streak is broken', () => {
    const matches = [
      makeMatch({ matchId: 'm1', date: daysAgo(3), winners: ['p2'], losers: ['p1'] }), // loss
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['p1'], losers: ['p3'] }), // win
      makeMatch({ matchId: 'm3', date: daysAgo(1), winners: ['p1'], losers: ['p4'] }), // win
    ];

    // Most recent two are wins, then a loss breaks it
    expect(calculateCurrentStreak(matches, 'p1')).toBe(2);
  });

  it('returns 0 for empty match history', () => {
    expect(calculateCurrentStreak([], 'p1')).toBe(0);
  });

  it('returns 1 for a single win', () => {
    const matches = [
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['p1'], losers: ['p2'] }),
    ];

    expect(calculateCurrentStreak(matches, 'p1')).toBe(1);
  });

  it('returns -1 for a single loss', () => {
    const matches = [
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['p2'], losers: ['p1'] }),
    ];

    expect(calculateCurrentStreak(matches, 'p1')).toBe(-1);
  });
});

// ─── calculatePlayerScore ────────────────────────────────────────────

describe('calculatePlayerScore', () => {
  it('returns all scoring components and composite score', () => {
    const matches = [
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['p1'], losers: ['p3'], participants: ['p1', 'p3'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['p2'], losers: ['p1'], participants: ['p1', 'p2'] }),
    ];

    const allPlayers = new Map([
      ['p1', { wins: 2, losses: 1, total: 3 }],
      ['p2', { wins: 1, losses: 2, total: 3 }],
      ['p3', { wins: 0, losses: 1, total: 1 }],
    ]);

    const result = calculatePlayerScore('p1', matches, allPlayers);

    expect(result.playerId).toBe('p1');
    expect(result.matchesInPeriod).toBe(3);
    expect(result.winsInPeriod).toBe(2);
    expect(result.winPercentage).toBeCloseTo(66.67, 1);
    expect(result.currentStreak).toBe(2); // 2 most recent wins
    expect(result.rankingScore).toBeGreaterThan(0);
    expect(result.rankingScore).toBeLessThanOrEqual(100);
  });

  it('win percentage is weighted at 40% of total score', () => {
    // 100% win rate with minimal other factors
    const matches = [
      makeMatch({ matchId: 'm1', date: daysAgo(0), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
    ];
    const allPlayers = new Map([
      ['p1', { wins: 1, losses: 0, total: 1 }],
      ['p2', { wins: 0, losses: 1, total: 1 }],
    ]);

    const result = calculatePlayerScore('p1', matches, allPlayers);

    // winPercentage = 100, contributes 100 * 0.4 = 40 to the score
    expect(result.winPercentage).toBe(100);
    // Score should be at least 40 (from win%) plus streak, quality, recency
    expect(result.rankingScore).toBeGreaterThanOrEqual(40);
  });

  it('streak bonus caps at 100 (10 points per win)', () => {
    // 12 consecutive wins — bonus should cap at 100
    const matches = Array.from({ length: 12 }, (_, i) =>
      makeMatch({
        matchId: `m${i}`,
        date: daysAgo(12 - i),
        winners: ['p1'],
        losers: ['p2'],
        participants: ['p1', 'p2'],
      }),
    );

    const allPlayers = new Map([
      ['p1', { wins: 12, losses: 0, total: 12 }],
      ['p2', { wins: 0, losses: 12, total: 12 }],
    ]);

    const result = calculatePlayerScore('p1', matches, allPlayers);

    expect(result.currentStreak).toBe(12);
    // Streak bonus capped at 100, contributing 100 * 0.2 = 20 max
    // Total score cannot exceed 100
    expect(result.rankingScore).toBeLessThanOrEqual(100);
  });

  it('quality score uses opponent win rates', () => {
    // Beat a strong opponent (80% win rate)
    const matches = [
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['p1'], losers: ['strong'], participants: ['p1', 'strong'] }),
    ];

    const allPlayers = new Map([
      ['p1', { wins: 1, losses: 0, total: 1 }],
      ['strong', { wins: 8, losses: 2, total: 10 }],
    ]);

    const result = calculatePlayerScore('p1', matches, allPlayers);

    // Quality = avg opponent win rate * 100 = 80
    expect(result.qualityScore).toBeCloseTo(80, 0);
  });

  it('loss streak results in 0 streak bonus', () => {
    const matches = [
      makeMatch({ matchId: 'm1', date: daysAgo(2), winners: ['p2'], losers: ['p1'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(1), winners: ['p3'], losers: ['p1'], participants: ['p1', 'p3'] }),
    ];

    const allPlayers = new Map([
      ['p1', { wins: 0, losses: 2, total: 2 }],
      ['p2', { wins: 1, losses: 0, total: 1 }],
      ['p3', { wins: 1, losses: 0, total: 1 }],
    ]);

    const result = calculatePlayerScore('p1', matches, allPlayers);

    expect(result.currentStreak).toBe(-2);
    // 0% win rate, 0 streak bonus, 0 quality (no wins), low recency
    expect(result.winPercentage).toBe(0);
  });

  it('recency favors recent matches via exponential decay', () => {
    // Both players: 1 win + 1 loss, but at different times
    // "recent" player won recently and lost long ago
    // "old" player lost recently and won long ago
    const recentPlayer = [
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['r'], losers: ['x'], participants: ['r', 'x'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(25), winners: ['x'], losers: ['r'], participants: ['r', 'x'] }),
    ];
    const oldPlayer = [
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['x'], losers: ['o'], participants: ['o', 'x'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(25), winners: ['o'], losers: ['x'], participants: ['o', 'x'] }),
    ];

    const stats = new Map([
      ['r', { wins: 1, losses: 1, total: 2 }],
      ['o', { wins: 1, losses: 1, total: 2 }],
      ['x', { wins: 2, losses: 2, total: 4 }],
    ]);

    const recent = calculatePlayerScore('r', recentPlayer, stats);
    const old = calculatePlayerScore('o', oldPlayer, stats);

    // Recent win is weighted more heavily than old win
    expect(recent.recencyScore).toBeGreaterThan(old.recencyScore);
  });
});

// ─── calculateRankingsForChampionship ────────────────────────────────

describe('calculateCurrentStreak with draws', () => {
  const win = makeMatch({ matchId: 'w', date: daysAgo(3), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] });
  const loss = makeMatch({ matchId: 'l', date: daysAgo(3), winners: ['p2'], losers: ['p1'], participants: ['p1', 'p2'] });
  const draw = {
    ...makeMatch({ matchId: 'd', date: daysAgo(2), winners: ['p1', 'p2'], losers: [], participants: ['p1', 'p2'] }),
    isDraw: true,
  };
  const newerWin = { ...win, matchId: 'w2', date: daysAgo(1) };
  const newerLoss = { ...loss, matchId: 'l2', date: daysAgo(1) };

  it('returns 0 when the latest match is a draw', () => {
    expect(calculateCurrentStreak([win, draw], 'p1')).toBe(0);
  });

  it('stops a win streak at a draw', () => {
    expect(calculateCurrentStreak([win, draw, newerWin], 'p1')).toBe(1);
  });

  it('stops a loss streak at a draw', () => {
    expect(calculateCurrentStreak([loss, draw, newerLoss], 'p1')).toBe(-1);
  });
});

describe('calculateRankingsForChampionship', () => {
  /** Queue the two scans in the order the calculator reads them. */
  function mockTables(matches: unknown[], players?: Array<Record<string, unknown>>) {
    const playerIds = new Set(
      (matches as Array<{ participants: string[] }>).flatMap((match) => match.participants),
    );
    mockScanAll.mockResolvedValueOnce(players ?? [...playerIds].map((playerId) => ({ playerId, currentWrestler: 'Edge' })));
    mockScanAll.mockResolvedValueOnce(matches);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ranked contenders sorted by score', async () => {
    // No division filter
    mockTables([
      // Matches — 4 completed matches in the last 30 days
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['p1'], losers: ['p3'], participants: ['p1', 'p3'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm4', date: daysAgo(4), winners: ['p2'], losers: ['p3'], participants: ['p2', 'p3'] }),
      makeMatch({ matchId: 'm5', date: daysAgo(5), winners: ['p2'], losers: ['p3'], participants: ['p2', 'p3'] }),
      makeMatch({ matchId: 'm6', date: daysAgo(6), winners: ['p2'], losers: ['p3'], participants: ['p2', 'p3'] }),
    ]);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    expect(results.length).toBeGreaterThan(0);
    // Rankings should be 1-indexed
    expect(results[0].rank).toBe(1);
    // Should be sorted descending by score
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].rankingScore).toBeGreaterThanOrEqual(results[i].rankingScore);
    }
  });

  describe('alwaysIncludePlayerIds', () => {
    const params = {
      championshipId: 'champ-1',
      championshipType: 'singles' as const,
      currentChampion: undefined as string | undefined,
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    };
    const threeMatches = [
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm4', date: daysAgo(4), winners: ['p3'], losers: ['p1'], participants: ['p3', 'p1'] }),
    ];
    const roster = (extra: Array<Record<string, unknown>> = []) => [
      { playerId: 'p1', currentWrestler: 'Edge' },
      { playerId: 'p2', currentWrestler: 'Christian' },
      { playerId: 'p3', currentWrestler: 'Kane' },
      ...extra,
    ];

    it('adds a row with real stats for a player under the match minimum', async () => {
      mockTables(threeMatches, roster());
      const results = await calculateRankingsForChampionship({ ...params, alwaysIncludePlayerIds: ['p3'] });

      expect(results.find((r) => r.playerId === 'p3')).toMatchObject({
        rank: 0, matchesInPeriod: 1, winsInPeriod: 1, winPercentage: 100,
      });
    });

    it('adds an empty row for a player with no matches, with no matches in the season at all', async () => {
      mockTables([], roster([{ playerId: 'fresh', currentWrestler: 'Sting' }]));
      const results = await calculateRankingsForChampionship({ ...params, alwaysIncludePlayerIds: ['fresh'] });

      expect(results).toEqual([{
        playerId: 'fresh', rank: 0, rankingScore: 0, winPercentage: 0, currentStreak: 0,
        qualityScore: 0, recencyScore: 0, matchesInPeriod: 0, winsInPeriod: 0,
      }]);
    });

    it('keeps the organic rank of a scored player outside the top N', async () => {
      mockTables(threeMatches, roster());
      const results = await calculateRankingsForChampionship({
        ...params, maxContenders: 1, alwaysIncludePlayerIds: ['p2'],
      });

      expect(results.map((r) => [r.playerId, r.rank])).toEqual([['p1', 1], ['p2', 2]]);
    });

    it('gives no row to the champion, a deleted, hidden or out-of-division player', async () => {
      const blocked = [
        { playerId: 'champ', currentWrestler: 'Sting', divisionId: 'd1' },
        { playerId: 'gone', currentWrestler: 'Sting', divisionId: 'd1', deletedAt: '2026-01-01' },
        { playerId: 'hidden', currentWrestler: 'Needs Wrestler', divisionId: 'd1' },
        { playerId: 'other', currentWrestler: 'Sting', divisionId: 'd2' },
      ];
      mockTables([
        makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['gone'], losers: ['other'], participants: ['gone', 'other'] }),
      ], blocked);
      const results = await calculateRankingsForChampionship({
        ...params,
        currentChampion: 'champ',
        divisionId: 'd1',
        alwaysIncludePlayerIds: blocked.map((player) => player.playerId as string),
      });

      expect(results).toEqual([]);
    });

    it('adds nothing past the top N when no one is named', async () => {
      mockTables(threeMatches, roster());
      const results = await calculateRankingsForChampionship({ ...params, maxContenders: 1 });
      expect(results.map((r) => r.playerId)).toEqual(['p1']);
    });
  });

  it('excludes the current champion (string)', async () => {
    mockTables([
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['champ'], losers: ['p1'], participants: ['champ', 'p1'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['champ'], losers: ['p2'], participants: ['champ', 'p2'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['champ'], losers: ['p1'], participants: ['champ', 'p1'] }),
      makeMatch({ matchId: 'm4', date: daysAgo(4), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm5', date: daysAgo(5), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm6', date: daysAgo(6), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
    ]);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: 'champ',
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    const ids = results.map((r) => r.playerId);
    expect(ids).not.toContain('champ');
  });

  it('excludes every player in an array champion', async () => {
    mockTables([
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['t1a', 't1b'], losers: ['p1'], participants: ['t1a', 't1b', 'p1'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['t1a'], losers: ['p1'], participants: ['t1a', 'p1'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['t1a'], losers: ['p1'], participants: ['t1a', 'p1'] }),
    ]);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      // The player path still honours an array champion.
      championshipType: 'singles',
      currentChampion: ['t1a', 't1b'],
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    const ids = results.map((r) => r.playerId);
    expect(ids).not.toContain('t1a');
    expect(ids).not.toContain('t1b');
  });

  it('excludes players below minimum match threshold', async () => {
    mockTables([
      // p1 has 3 matches (meets min), p2 has 2 matches (below min of 3)
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['p1'], losers: ['p3'], participants: ['p1', 'p3'] }),
    ]);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    const ids = results.map((r) => r.playerId);
    expect(ids).toContain('p1');
    expect(ids).not.toContain('p2'); // only 2 matches
    expect(ids).not.toContain('p3'); // only 1 match
  });

  it('respects division lock when divisionId is set', async () => {
    // First call: scanAll for players
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p1', divisionId: 'div-1', currentWrestler: 'Edge' },
      { playerId: 'p2', divisionId: 'div-2', currentWrestler: 'Edge' },
    ]);
    // Second call: scanAll for matches
    mockScanAll.mockResolvedValueOnce([
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm4', date: daysAgo(4), winners: ['p2'], losers: ['p1'], participants: ['p1', 'p2'] }),
    ]);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      divisionId: 'div-1',
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    const ids = results.map((r) => r.playerId);
    expect(ids).toContain('p1');
    expect(ids).not.toContain('p2'); // not in division
  });

  it('never ranks a deleted player, soft-deleted or with no row at all', async () => {
    const wins = (playerId: string) => [1, 2, 3].map((day) =>
      makeMatch({
        matchId: `${playerId}-${day}`,
        date: daysAgo(day),
        winners: [playerId],
        losers: ['p2'],
        participants: [playerId, 'p2'],
      }),
    );
    mockTables(
      [...wins('p1'), ...wins('soft-deleted'), ...wins('no-row')],
      [
        { playerId: 'p1', currentWrestler: 'Edge' },
        { playerId: 'p2', currentWrestler: 'Edge' },
        { playerId: 'soft-deleted', currentWrestler: 'Edge', deletedAt: '2026-01-01T00:00:00.000Z' },
      ],
    );

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    expect(results.map((r) => r.playerId).sort()).toEqual(['p1', 'p2']);
  });

  it('gives a hidden player no contender slot', async () => {
    const wins = (playerId: string) => [1, 2, 3].map((day) =>
      makeMatch({
        matchId: `${playerId}-${day}`,
        date: daysAgo(day),
        winners: [playerId],
        losers: ['p2'],
        participants: [playerId, 'p2'],
      }),
    );
    mockTables(
      [...wins('p1'), ...wins('hidden')],
      [
        { playerId: 'p1', currentWrestler: 'Edge' },
        { playerId: 'p2', currentWrestler: 'Kane' },
        { playerId: 'hidden', currentWrestler: 'Needs Wrestler' },
      ],
    );

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    expect(results.map((r) => r.playerId)).not.toContain('hidden');
    expect(mockScanAll.mock.calls[0][0].ProjectionExpression).toContain('currentWrestler');
  });

  it('gives a deactivated player no contender slot, and reads the flag to know', async () => {
    const wins = (playerId: string) => [1, 2, 3].map((day) =>
      makeMatch({
        matchId: `${playerId}-${day}`,
        date: daysAgo(day),
        winners: [playerId],
        losers: ['p2'],
        participants: [playerId, 'p2'],
      }),
    );
    mockTables(
      [...wins('p1'), ...wins('gone')],
      [
        { playerId: 'p1', currentWrestler: 'Edge' },
        { playerId: 'p2', currentWrestler: 'Kane' },
        { playerId: 'gone', currentWrestler: 'Sting', deactivatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    );

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    expect(results.map((r) => r.playerId)).toContain('p1');
    expect(results.map((r) => r.playerId)).not.toContain('gone');
    expect(mockScanAll.mock.calls[0][0].ProjectionExpression).toContain('deactivatedAt');
  });

  it('counts a draw as neither a win nor a loss', async () => {
    const drawn = makeMatch({
      matchId: 'draw',
      date: daysAgo(1),
      winners: ['p1', 'p2'],
      losers: [],
      participants: ['p1', 'p2'],
    });
    mockTables([
      { ...drawn, isDraw: true },
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['p2'], losers: ['p1'], participants: ['p1', 'p2'] }),
    ]);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    const p1 = results.find((r) => r.playerId === 'p1');
    expect(p1?.winsInPeriod).toBe(1);
    expect(p1?.matchesInPeriod).toBe(3);
    expect(p1?.currentStreak).toBe(0);
  });

  it('limits results to maxContenders', async () => {
    // Generate enough matches for 5 players with 3+ matches each
    const matches: any[] = [];
    for (let p = 1; p <= 5; p++) {
      for (let m = 0; m < 3; m++) {
        matches.push(
          makeMatch({
            matchId: `m-p${p}-${m}`,
            date: daysAgo(m + 1),
            winners: [`p${p}`],
            losers: ['opponent'],
            participants: [`p${p}`, 'opponent'],
          }),
        );
      }
    }
    mockTables(matches);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 3, // limit to 3
    });

    expect(results).toHaveLength(3);
  });

  it('returns empty array when no matches exist', async () => {
    mockTables([]);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    expect(results).toEqual([]);
  });
});

// ─── Tag titles ──────────────────────────────────────────────────────

describe('calculateRankingsForChampionship on a tag title', () => {
  function makeTeam(tagTeamId: string, player1Id: string, player2Id: string, status = 'active') {
    return {
      tagTeamId,
      name: tagTeamId,
      player1Id,
      player2Id,
      status,
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: daysAgo(100),
      updatedAt: daysAgo(100),
    };
  }

  function tagMatch(matchId: string, days: number, winners: string[], losers: string[], isDraw = false) {
    return makeMatch({
      matchId,
      date: daysAgo(days),
      winners,
      losers,
      teams: [winners, losers],
      matchFormat: 'tag',
      isDraw,
    });
  }

  const teams = [
    makeTeam('team-a', 'a1', 'a2'),
    makeTeam('team-b', 'b1', 'b2'),
    makeTeam('team-c', 'c1', 'c2'),
  ];

  // A: 3-0. B: 1-3. C: 1-2.
  const matches = [
    tagMatch('m1', 1, ['a1', 'a2'], ['b1', 'b2']),
    tagMatch('m2', 2, ['a1', 'a2'], ['c1', 'c2']),
    tagMatch('m3', 3, ['b1', 'b2'], ['c1', 'c2']),
    tagMatch('m4', 4, ['a1', 'a2'], ['b1', 'b2']),
    tagMatch('m5', 5, ['c1', 'c2'], ['b1', 'b2']),
  ];

  function mockTagTables(
    matchList: unknown[],
    teamList: unknown[],
    players?: Array<Record<string, unknown>>,
  ) {
    const playerIds = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2', 'x1', 'x2'];
    mockScanAll.mockResolvedValueOnce(players ?? playerIds.map((playerId) => ({ playerId, currentWrestler: 'Edge' })));
    mockScanAll.mockResolvedValueOnce(matchList);
    mockListTagTeams.mockResolvedValueOnce(teamList);
  }

  const baseParams = {
    championshipId: 'tag-title',
    championshipType: 'tag' as const,
    currentChampion: undefined,
    seasonId: 'season-1',
    minimumMatches: 3,
    maxContenders: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ranks tag teams, not players, keyed by tagTeamId', async () => {
    mockTagTables(matches, teams);

    const results = await calculateRankingsForChampionship(baseParams);

    expect(results.map((r) => r.playerId)).toEqual(['team-a', 'team-c', 'team-b']);
    for (const row of results) {
      expect(row.entityType).toBe('tagTeam');
      expect(row.tagTeamId).toBe(row.playerId);
    }
    expect(results[0]).toMatchObject({ rank: 1, matchesInPeriod: 3, winsInPeriod: 3, currentStreak: 3 });
    // Quality uses the beaten teams' win rates: B (1/4) twice, C (1/3) once.
    expect(results[0].qualityScore).toBeCloseTo(((0.25 + 0.25 + 1 / 3) / 3) * 100, 1);
    expect(mockListTagTeams).toHaveBeenCalledTimes(1);
  });

  it('excludes the champions, by member array or by currentTagTeamId', async () => {
    mockTagTables(matches, teams);
    const byMembers = await calculateRankingsForChampionship({ ...baseParams, currentChampion: ['a2', 'a1'] });
    expect(byMembers.map((r) => r.playerId)).not.toContain('team-a');
    expect(byMembers).toHaveLength(2);

    mockTagTables(matches, teams);
    const byTeamId = await calculateRankingsForChampionship({ ...baseParams, currentTagTeamId: 'team-b' });
    expect(byTeamId.map((r) => r.playerId)).toEqual(['team-a', 'team-c']);
  });

  it('does not exclude a team that shares only one member with the champions', async () => {
    mockTagTables(matches, teams);
    const results = await calculateRankingsForChampionship({ ...baseParams, currentChampion: ['a1', 'x1'] });
    expect(results.map((r) => r.playerId)).toContain('team-a');
  });

  it('excludes a team below the minimum team matches', async () => {
    mockTagTables(matches, teams);
    const results = await calculateRankingsForChampionship({ ...baseParams, minimumMatches: 4 });
    expect(results.map((r) => r.playerId)).toEqual(['team-b']);
  });

  it('excludes a team with one member outside the title division', async () => {
    const players = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].map((playerId) => ({
      playerId,
      currentWrestler: 'Edge',
      divisionId: playerId === 'c2' ? 'smackdown' : 'raw',
    }));
    mockTagTables(matches, teams, players);

    const results = await calculateRankingsForChampionship({ ...baseParams, divisionId: 'raw' });
    expect(results.map((r) => r.playerId)).toEqual(['team-a', 'team-b']);
  });

  it('ignores teams that are not active and pairs that are not registered teams', async () => {
    const withDissolved = [...teams, makeTeam('team-d', 'd1', 'd2', 'dissolved')];
    mockTagTables(
      [
        ...matches,
        tagMatch('m6', 1, ['d1', 'd2'], ['x1', 'x2']),
        tagMatch('m7', 2, ['d1', 'd2'], ['x1', 'x2']),
        tagMatch('m8', 3, ['d1', 'd2'], ['x1', 'x2']),
      ],
      withDissolved,
    );

    const ids = (await calculateRankingsForChampionship(baseParams)).map((r) => r.playerId);
    expect(ids).toEqual(['team-a', 'team-c', 'team-b']);
  });

  it('counts a draw as a team match that is neither a win nor a loss', async () => {
    mockTagTables([...matches, tagMatch('m0', 0, ['a1', 'a2'], ['c1', 'c2'], true)], teams);

    const results = await calculateRankingsForChampionship(baseParams);
    const teamA = results.find((r) => r.playerId === 'team-a');
    expect(teamA).toMatchObject({ matchesInPeriod: 4, winsInPeriod: 3, currentStreak: 0 });
  });

  it('skips singles matches', async () => {
    mockTagTables(
      [...matches, makeMatch({ matchId: 's1', date: daysAgo(1), winners: ['a1'], losers: ['b1'] })],
      teams,
    );
    const teamA = (await calculateRankingsForChampionship(baseParams)).find((r) => r.playerId === 'team-a');
    expect(teamA?.matchesInPeriod).toBe(3);
  });
});

describe('calculateRankingsForChampionship on a singles title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces the same rows as before tag rankings existed', async () => {
    const matches = [
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['p1'], losers: ['p3'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['p1'], losers: ['p2'] }),
      makeMatch({ matchId: 'm4', date: daysAgo(4), winners: ['p2'], losers: ['p3'] }),
      makeMatch({ matchId: 'm5', date: daysAgo(5), winners: ['p2'], losers: ['p3'] }),
      makeMatch({ matchId: 'm6', date: daysAgo(6), winners: ['p3', 'p2'], losers: [], isDraw: true }),
    ];
    mockScanAll.mockResolvedValueOnce(['p1', 'p2', 'p3'].map((playerId) => ({ playerId, currentWrestler: 'Edge' })));
    mockScanAll.mockResolvedValueOnce(matches);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      seasonId: 'season-1',
      minimumMatches: 3,
      maxContenders: 10,
    });

    expect(mockListTagTeams).not.toHaveBeenCalled();
    expect(results).toMatchInlineSnapshot(`
      [
        {
          "currentStreak": 3,
          "matchesInPeriod": 3,
          "playerId": "p1",
          "qualityScore": 26.67,
          "rank": 1,
          "rankingScore": 67.67,
          "recencyScore": 100,
          "winPercentage": 100,
          "winsInPeriod": 3,
        },
        {
          "currentStreak": -2,
          "matchesInPeriod": 5,
          "playerId": "p2",
          "qualityScore": 0,
          "rank": 2,
          "rankingScore": 21.85,
          "recencyScore": 39.02,
          "winPercentage": 40,
          "winsInPeriod": 2,
        },
        {
          "currentStreak": -3,
          "matchesInPeriod": 4,
          "playerId": "p3",
          "qualityScore": 0,
          "rank": 3,
          "rankingScore": 0,
          "recencyScore": 0,
          "winPercentage": 0,
          "winsInPeriod": 0,
        },
      ]
    `);
  });
});
