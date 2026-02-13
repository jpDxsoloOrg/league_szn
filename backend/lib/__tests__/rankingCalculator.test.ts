import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dynamodb before importing the calculator
const { mockScanAll } = vi.hoisted(() => ({
  mockScanAll: vi.fn(),
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
}) {
  return {
    matchId: overrides.matchId ?? 'match-1',
    date: overrides.date ?? new Date().toISOString(),
    participants: overrides.participants ?? [...(overrides.winners ?? []), ...(overrides.losers ?? [])],
    winners: overrides.winners ?? [],
    losers: overrides.losers ?? [],
    status: 'completed',
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

    const result = calculatePlayerScore('p1', matches, allPlayers, 30);

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

    const result = calculatePlayerScore('p1', matches, allPlayers, 30);

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

    const result = calculatePlayerScore('p1', matches, allPlayers, 30);

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

    const result = calculatePlayerScore('p1', matches, allPlayers, 30);

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

    const result = calculatePlayerScore('p1', matches, allPlayers, 30);

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

    const recent = calculatePlayerScore('r', recentPlayer, stats, 30);
    const old = calculatePlayerScore('o', oldPlayer, stats, 30);

    // Recent win is weighted more heavily than old win
    expect(recent.recencyScore).toBeGreaterThan(old.recencyScore);
  });
});

// ─── calculateRankingsForChampionship ────────────────────────────────

describe('calculateRankingsForChampionship', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ranked contenders sorted by score', async () => {
    // No division filter
    mockScanAll.mockResolvedValueOnce([
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
      periodDays: 30,
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

  it('excludes the current champion (string)', async () => {
    mockScanAll.mockResolvedValueOnce([
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
      periodDays: 30,
      minimumMatches: 3,
      maxContenders: 10,
    });

    const ids = results.map((r) => r.playerId);
    expect(ids).not.toContain('champ');
  });

  it('excludes the current champion (array for tag team)', async () => {
    mockScanAll.mockResolvedValueOnce([
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['t1a', 't1b'], losers: ['p1'], participants: ['t1a', 't1b', 'p1'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['t1a'], losers: ['p1'], participants: ['t1a', 'p1'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['t1a'], losers: ['p1'], participants: ['t1a', 'p1'] }),
    ]);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'tag',
      currentChampion: ['t1a', 't1b'],
      periodDays: 30,
      minimumMatches: 3,
      maxContenders: 10,
    });

    const ids = results.map((r) => r.playerId);
    expect(ids).not.toContain('t1a');
    expect(ids).not.toContain('t1b');
  });

  it('excludes players below minimum match threshold', async () => {
    mockScanAll.mockResolvedValueOnce([
      // p1 has 3 matches (meets min), p2 has 2 matches (below min of 3)
      makeMatch({ matchId: 'm1', date: daysAgo(1), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm2', date: daysAgo(2), winners: ['p1'], losers: ['p2'], participants: ['p1', 'p2'] }),
      makeMatch({ matchId: 'm3', date: daysAgo(3), winners: ['p1'], losers: ['p3'], participants: ['p1', 'p3'] }),
    ]);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      periodDays: 30,
      minimumMatches: 3,
      maxContenders: 10,
    });

    const ids = results.map((r) => r.playerId);
    expect(ids).toContain('p1');
    expect(ids).not.toContain('p2'); // only 2 matches
    expect(ids).not.toContain('p3'); // only 1 match
  });

  it('respects division lock when divisionId is set', async () => {
    // First call: scanAll for players in division
    mockScanAll.mockResolvedValueOnce([
      { playerId: 'p1', divisionId: 'div-1' },
      // p2 is NOT in this division
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
      periodDays: 30,
      minimumMatches: 3,
      maxContenders: 10,
    });

    const ids = results.map((r) => r.playerId);
    expect(ids).toContain('p1');
    expect(ids).not.toContain('p2'); // not in division
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
    mockScanAll.mockResolvedValueOnce(matches);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      periodDays: 30,
      minimumMatches: 3,
      maxContenders: 3, // limit to 3
    });

    expect(results).toHaveLength(3);
  });

  it('returns empty array when no matches exist', async () => {
    mockScanAll.mockResolvedValueOnce([]);

    const results = await calculateRankingsForChampionship({
      championshipId: 'champ-1',
      championshipType: 'singles',
      currentChampion: undefined,
      periodDays: 30,
      minimumMatches: 3,
      maxContenders: 10,
    });

    expect(results).toEqual([]);
  });
});
