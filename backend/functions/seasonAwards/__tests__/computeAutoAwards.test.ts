import { describe, it, expect } from 'vitest';
import { computeAutoAwards } from '../getSeasonAwards';

const players = [
  { playerId: 'p1', name: 'Player One' },
  { playerId: 'p2', name: 'Player Two' },
  { playerId: 'p3', name: 'Player Three' },
];

describe('computeAutoAwards', () => {
  it('returns MVP for the player with most wins', () => {
    const matches = [
      { matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed', date: '2024-01-01' },
      { matchId: 'm2', seasonId: 's1', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'], status: 'completed', date: '2024-01-02' },
      { matchId: 'm3', seasonId: 's1', participants: ['p2', 'p3'], winners: ['p2'], losers: ['p3'], status: 'completed', date: '2024-01-03' },
    ];

    const awards = computeAutoAwards('s1', matches, players, []);
    const mvp = awards.find(a => a.awardType === 'mvp');
    expect(mvp).toBeDefined();
    expect(mvp!.playerId).toBe('p1');
    expect(mvp!.value).toBe('2 wins');
  });

  it('returns Iron Man for player with most matches', () => {
    const matches = [
      { matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed', date: '2024-01-01' },
      { matchId: 'm2', seasonId: 's1', participants: ['p1', 'p3'], winners: ['p3'], losers: ['p1'], status: 'completed', date: '2024-01-02' },
      { matchId: 'm3', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'], status: 'completed', date: '2024-01-03' },
    ];

    const awards = computeAutoAwards('s1', matches, players, []);
    const ironMan = awards.find(a => a.awardType === 'iron_man');
    expect(ironMan).toBeDefined();
    expect(ironMan!.playerId).toBe('p1');
    expect(ironMan!.value).toBe('3 matches');
  });

  it('returns Longest Win Streak', () => {
    const matches = [
      { matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed', date: '2024-01-01' },
      { matchId: 'm2', seasonId: 's1', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'], status: 'completed', date: '2024-01-02' },
      { matchId: 'm3', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed', date: '2024-01-03' },
    ];

    const awards = computeAutoAwards('s1', matches, players, []);
    const streak = awards.find(a => a.awardType === 'longest_win_streak');
    expect(streak).toBeDefined();
    expect(streak!.playerId).toBe('p1');
    expect(streak!.value).toBe('3 wins');
  });

  it('returns Best Win Percentage when minimum matches met', () => {
    const matches = [
      { matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed', date: '2024-01-01' },
      { matchId: 'm2', seasonId: 's1', participants: ['p1', 'p3'], winners: ['p1'], losers: ['p3'], status: 'completed', date: '2024-01-02' },
      { matchId: 'm3', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p2'], losers: ['p1'], status: 'completed', date: '2024-01-03' },
      { matchId: 'm4', seasonId: 's1', participants: ['p2', 'p3'], winners: ['p3'], losers: ['p2'], status: 'completed', date: '2024-01-04' },
    ];

    const awards = computeAutoAwards('s1', matches, players, []);
    const bestPct = awards.find(a => a.awardType === 'best_win_pct');
    expect(bestPct).toBeDefined();
    expect(bestPct!.playerId).toBe('p1');
    expect(bestPct!.value).toBe('67%');
  });

  it('returns Most Championship Defenses', () => {
    const matches = [
      { matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed', date: '2024-01-01' },
    ];
    const history = [
      { championshipId: 'c1', champion: 'p1', wonDate: '2024-01-01', defenses: 5 },
      { championshipId: 'c2', champion: 'p2', wonDate: '2024-01-01', defenses: 2 },
    ];

    const awards = computeAutoAwards('s1', matches, players, history);
    const defenses = awards.find(a => a.awardType === 'most_title_defenses');
    expect(defenses).toBeDefined();
    expect(defenses!.playerId).toBe('p1');
    expect(defenses!.value).toBe('5 defenses');
  });

  it('returns empty awards when no completed matches for season', () => {
    const matches = [
      { matchId: 'm1', seasonId: 's2', participants: ['p1', 'p2'], winners: ['p1'], losers: ['p2'], status: 'completed', date: '2024-01-01' },
    ];

    const awards = computeAutoAwards('s1', matches, players, []);
    expect(awards).toHaveLength(0);
  });

  it('ignores scheduled (non-completed) matches', () => {
    const matches = [
      { matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'], status: 'scheduled', date: '2024-01-01' },
    ];

    const awards = computeAutoAwards('s1', matches, players, []);
    expect(awards).toHaveLength(0);
  });
});
