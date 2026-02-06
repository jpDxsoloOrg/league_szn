import {
  PlayerStatistics,
  HeadToHead,
  ChampionshipStats,
  Achievement,
  LeaderboardEntry,
  RecordEntry,
} from '../types/statistics';

// Mock player list for dropdowns
export interface MockPlayer {
  playerId: string;
  name: string;
  wrestlerName: string;
}

export const mockPlayers: MockPlayer[] = [
  { playerId: 'p1', name: 'John', wrestlerName: 'Stone Cold' },
  { playerId: 'p2', name: 'Mike', wrestlerName: 'The Rock' },
  { playerId: 'p3', name: 'Chris', wrestlerName: 'Triple H' },
  { playerId: 'p4', name: 'Dave', wrestlerName: 'Undertaker' },
  { playerId: 'p5', name: 'Alex', wrestlerName: 'CM Punk' },
  { playerId: 'p6', name: 'Ryan', wrestlerName: 'John Cena' },
  { playerId: 'p7', name: 'Steve', wrestlerName: 'Edge' },
  { playerId: 'p8', name: 'Tom', wrestlerName: 'Roman Reigns' },
  { playerId: 'p9', name: 'Jake', wrestlerName: 'Finn Balor' },
  { playerId: 'p10', name: 'Kevin', wrestlerName: 'Shawn Michaels' },
];

// Full player statistics - overall + by match type
export const mockPlayerStatistics: PlayerStatistics[] = [
  // John / Stone Cold - overall
  { playerId: 'p1', statType: 'overall', wins: 87, losses: 34, draws: 5, matchesPlayed: 126, winPercentage: 69.0, currentWinStreak: 5, longestWinStreak: 12, longestLossStreak: 3, firstMatchDate: '2023-01-15', lastMatchDate: '2025-04-20', championshipWins: 8, championshipLosses: 3, updatedAt: '2025-04-20' },
  { playerId: 'p1', statType: 'singles', wins: 52, losses: 20, draws: 3, matchesPlayed: 75, winPercentage: 69.3, currentWinStreak: 3, longestWinStreak: 9, longestLossStreak: 2, firstMatchDate: '2023-01-15', lastMatchDate: '2025-04-18', championshipWins: 6, championshipLosses: 2, updatedAt: '2025-04-18' },
  { playerId: 'p1', statType: 'tag', wins: 20, losses: 8, draws: 1, matchesPlayed: 29, winPercentage: 69.0, currentWinStreak: 2, longestWinStreak: 6, longestLossStreak: 2, firstMatchDate: '2023-02-10', lastMatchDate: '2025-04-15', championshipWins: 1, championshipLosses: 0, updatedAt: '2025-04-15' },
  { playerId: 'p1', statType: 'ladder', wins: 9, losses: 4, draws: 1, matchesPlayed: 14, winPercentage: 64.3, currentWinStreak: 0, longestWinStreak: 4, longestLossStreak: 2, firstMatchDate: '2023-03-20', lastMatchDate: '2025-03-28', championshipWins: 1, championshipLosses: 1, updatedAt: '2025-03-28' },
  { playerId: 'p1', statType: 'cage', wins: 6, losses: 2, draws: 0, matchesPlayed: 8, winPercentage: 75.0, currentWinStreak: 1, longestWinStreak: 4, longestLossStreak: 1, firstMatchDate: '2023-06-12', lastMatchDate: '2025-04-20', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-04-20' },

  // Mike / The Rock - overall
  { playerId: 'p2', statType: 'overall', wins: 82, losses: 38, draws: 6, matchesPlayed: 126, winPercentage: 65.1, currentWinStreak: 2, longestWinStreak: 10, longestLossStreak: 4, firstMatchDate: '2023-01-15', lastMatchDate: '2025-04-19', championshipWins: 6, championshipLosses: 4, updatedAt: '2025-04-19' },
  { playerId: 'p2', statType: 'singles', wins: 48, losses: 22, draws: 4, matchesPlayed: 74, winPercentage: 64.9, currentWinStreak: 1, longestWinStreak: 8, longestLossStreak: 3, firstMatchDate: '2023-01-15', lastMatchDate: '2025-04-19', championshipWins: 4, championshipLosses: 3, updatedAt: '2025-04-19' },
  { playerId: 'p2', statType: 'tag', wins: 22, losses: 10, draws: 1, matchesPlayed: 33, winPercentage: 66.7, currentWinStreak: 2, longestWinStreak: 5, longestLossStreak: 2, firstMatchDate: '2023-02-10', lastMatchDate: '2025-04-12', championshipWins: 1, championshipLosses: 1, updatedAt: '2025-04-12' },
  { playerId: 'p2', statType: 'ladder', wins: 7, losses: 4, draws: 1, matchesPlayed: 12, winPercentage: 58.3, currentWinStreak: 0, longestWinStreak: 3, longestLossStreak: 2, firstMatchDate: '2023-04-05', lastMatchDate: '2025-03-15', championshipWins: 1, championshipLosses: 0, updatedAt: '2025-03-15' },
  { playerId: 'p2', statType: 'cage', wins: 5, losses: 2, draws: 0, matchesPlayed: 7, winPercentage: 71.4, currentWinStreak: 1, longestWinStreak: 3, longestLossStreak: 1, firstMatchDate: '2023-07-01', lastMatchDate: '2025-04-10', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-04-10' },

  // Chris / Triple H
  { playerId: 'p3', statType: 'overall', wins: 74, losses: 42, draws: 4, matchesPlayed: 120, winPercentage: 61.7, currentWinStreak: 0, longestWinStreak: 8, longestLossStreak: 5, firstMatchDate: '2023-01-20', lastMatchDate: '2025-04-18', championshipWins: 5, championshipLosses: 5, updatedAt: '2025-04-18' },
  { playerId: 'p3', statType: 'singles', wins: 44, losses: 26, draws: 2, matchesPlayed: 72, winPercentage: 61.1, currentWinStreak: 0, longestWinStreak: 6, longestLossStreak: 4, firstMatchDate: '2023-01-20', lastMatchDate: '2025-04-18', championshipWins: 4, championshipLosses: 4, updatedAt: '2025-04-18' },
  { playerId: 'p3', statType: 'tag', wins: 18, losses: 10, draws: 2, matchesPlayed: 30, winPercentage: 60.0, currentWinStreak: 1, longestWinStreak: 4, longestLossStreak: 3, firstMatchDate: '2023-02-15', lastMatchDate: '2025-04-10', championshipWins: 1, championshipLosses: 1, updatedAt: '2025-04-10' },
  { playerId: 'p3', statType: 'ladder', wins: 7, losses: 4, draws: 0, matchesPlayed: 11, winPercentage: 63.6, currentWinStreak: 1, longestWinStreak: 3, longestLossStreak: 2, firstMatchDate: '2023-05-10', lastMatchDate: '2025-03-20', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-03-20' },
  { playerId: 'p3', statType: 'cage', wins: 5, losses: 2, draws: 0, matchesPlayed: 7, winPercentage: 71.4, currentWinStreak: 0, longestWinStreak: 3, longestLossStreak: 1, firstMatchDate: '2023-08-05', lastMatchDate: '2025-02-28', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-02-28' },

  // Dave / Undertaker
  { playerId: 'p4', statType: 'overall', wins: 70, losses: 40, draws: 8, matchesPlayed: 118, winPercentage: 59.3, currentWinStreak: 3, longestWinStreak: 9, longestLossStreak: 4, firstMatchDate: '2023-01-22', lastMatchDate: '2025-04-17', championshipWins: 4, championshipLosses: 3, updatedAt: '2025-04-17' },
  { playerId: 'p4', statType: 'singles', wins: 42, losses: 24, draws: 5, matchesPlayed: 71, winPercentage: 59.2, currentWinStreak: 2, longestWinStreak: 7, longestLossStreak: 3, firstMatchDate: '2023-01-22', lastMatchDate: '2025-04-17', championshipWins: 3, championshipLosses: 2, updatedAt: '2025-04-17' },
  { playerId: 'p4', statType: 'tag', wins: 16, losses: 9, draws: 2, matchesPlayed: 27, winPercentage: 59.3, currentWinStreak: 1, longestWinStreak: 5, longestLossStreak: 2, firstMatchDate: '2023-03-01', lastMatchDate: '2025-04-08', championshipWins: 1, championshipLosses: 1, updatedAt: '2025-04-08' },
  { playerId: 'p4', statType: 'ladder', wins: 6, losses: 5, draws: 1, matchesPlayed: 12, winPercentage: 50.0, currentWinStreak: 0, longestWinStreak: 3, longestLossStreak: 3, firstMatchDate: '2023-05-20', lastMatchDate: '2025-03-10', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-03-10' },
  { playerId: 'p4', statType: 'cage', wins: 6, losses: 2, draws: 0, matchesPlayed: 8, winPercentage: 75.0, currentWinStreak: 2, longestWinStreak: 4, longestLossStreak: 1, firstMatchDate: '2023-07-15', lastMatchDate: '2025-04-05', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-04-05' },

  // Alex / CM Punk
  { playerId: 'p5', statType: 'overall', wins: 65, losses: 45, draws: 5, matchesPlayed: 115, winPercentage: 56.5, currentWinStreak: 1, longestWinStreak: 7, longestLossStreak: 5, firstMatchDate: '2023-02-01', lastMatchDate: '2025-04-16', championshipWins: 3, championshipLosses: 4, updatedAt: '2025-04-16' },
  { playerId: 'p5', statType: 'singles', wins: 40, losses: 28, draws: 3, matchesPlayed: 71, winPercentage: 56.3, currentWinStreak: 0, longestWinStreak: 5, longestLossStreak: 4, firstMatchDate: '2023-02-01', lastMatchDate: '2025-04-16', championshipWins: 2, championshipLosses: 3, updatedAt: '2025-04-16' },
  { playerId: 'p5', statType: 'tag', wins: 14, losses: 10, draws: 1, matchesPlayed: 25, winPercentage: 56.0, currentWinStreak: 1, longestWinStreak: 4, longestLossStreak: 3, firstMatchDate: '2023-03-10', lastMatchDate: '2025-04-05', championshipWins: 1, championshipLosses: 1, updatedAt: '2025-04-05' },
  { playerId: 'p5', statType: 'ladder', wins: 6, losses: 4, draws: 1, matchesPlayed: 11, winPercentage: 54.5, currentWinStreak: 1, longestWinStreak: 3, longestLossStreak: 2, firstMatchDate: '2023-06-01', lastMatchDate: '2025-03-22', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-03-22' },
  { playerId: 'p5', statType: 'cage', wins: 5, losses: 3, draws: 0, matchesPlayed: 8, winPercentage: 62.5, currentWinStreak: 0, longestWinStreak: 3, longestLossStreak: 2, firstMatchDate: '2023-08-20', lastMatchDate: '2025-02-15', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-02-15' },

  // Ryan / John Cena
  { playerId: 'p6', statType: 'overall', wins: 78, losses: 36, draws: 6, matchesPlayed: 120, winPercentage: 65.0, currentWinStreak: 4, longestWinStreak: 11, longestLossStreak: 3, firstMatchDate: '2023-01-18', lastMatchDate: '2025-04-20', championshipWins: 7, championshipLosses: 4, updatedAt: '2025-04-20' },
  { playerId: 'p6', statType: 'singles', wins: 46, losses: 21, draws: 4, matchesPlayed: 71, winPercentage: 64.8, currentWinStreak: 3, longestWinStreak: 8, longestLossStreak: 2, firstMatchDate: '2023-01-18', lastMatchDate: '2025-04-20', championshipWins: 5, championshipLosses: 3, updatedAt: '2025-04-20' },
  { playerId: 'p6', statType: 'tag', wins: 19, losses: 9, draws: 1, matchesPlayed: 29, winPercentage: 65.5, currentWinStreak: 1, longestWinStreak: 5, longestLossStreak: 2, firstMatchDate: '2023-02-20', lastMatchDate: '2025-04-14', championshipWins: 1, championshipLosses: 1, updatedAt: '2025-04-14' },
  { playerId: 'p6', statType: 'ladder', wins: 8, losses: 4, draws: 1, matchesPlayed: 13, winPercentage: 61.5, currentWinStreak: 1, longestWinStreak: 4, longestLossStreak: 2, firstMatchDate: '2023-04-15', lastMatchDate: '2025-03-30', championshipWins: 1, championshipLosses: 0, updatedAt: '2025-03-30' },
  { playerId: 'p6', statType: 'cage', wins: 5, losses: 2, draws: 0, matchesPlayed: 7, winPercentage: 71.4, currentWinStreak: 1, longestWinStreak: 3, longestLossStreak: 1, firstMatchDate: '2023-07-20', lastMatchDate: '2025-04-02', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-04-02' },

  // Steve / Edge
  { playerId: 'p7', statType: 'overall', wins: 60, losses: 48, draws: 7, matchesPlayed: 115, winPercentage: 52.2, currentWinStreak: 0, longestWinStreak: 6, longestLossStreak: 6, firstMatchDate: '2023-02-05', lastMatchDate: '2025-04-15', championshipWins: 2, championshipLosses: 5, updatedAt: '2025-04-15' },
  { playerId: 'p7', statType: 'singles', wins: 35, losses: 30, draws: 5, matchesPlayed: 70, winPercentage: 50.0, currentWinStreak: 0, longestWinStreak: 5, longestLossStreak: 4, firstMatchDate: '2023-02-05', lastMatchDate: '2025-04-15', championshipWins: 1, championshipLosses: 4, updatedAt: '2025-04-15' },
  { playerId: 'p7', statType: 'tag', wins: 15, losses: 11, draws: 1, matchesPlayed: 27, winPercentage: 55.6, currentWinStreak: 0, longestWinStreak: 4, longestLossStreak: 3, firstMatchDate: '2023-03-15', lastMatchDate: '2025-04-08', championshipWins: 1, championshipLosses: 1, updatedAt: '2025-04-08' },
  { playerId: 'p7', statType: 'ladder', wins: 7, losses: 4, draws: 1, matchesPlayed: 12, winPercentage: 58.3, currentWinStreak: 1, longestWinStreak: 3, longestLossStreak: 2, firstMatchDate: '2023-05-25', lastMatchDate: '2025-03-18', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-03-18' },
  { playerId: 'p7', statType: 'cage', wins: 3, losses: 3, draws: 0, matchesPlayed: 6, winPercentage: 50.0, currentWinStreak: 0, longestWinStreak: 2, longestLossStreak: 2, firstMatchDate: '2023-09-01', lastMatchDate: '2025-02-10', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-02-10' },

  // Tom / Roman Reigns
  { playerId: 'p8', statType: 'overall', wins: 80, losses: 30, draws: 4, matchesPlayed: 114, winPercentage: 70.2, currentWinStreak: 7, longestWinStreak: 15, longestLossStreak: 2, firstMatchDate: '2023-01-25', lastMatchDate: '2025-04-20', championshipWins: 9, championshipLosses: 2, updatedAt: '2025-04-20' },
  { playerId: 'p8', statType: 'singles', wins: 50, losses: 18, draws: 2, matchesPlayed: 70, winPercentage: 71.4, currentWinStreak: 5, longestWinStreak: 12, longestLossStreak: 2, firstMatchDate: '2023-01-25', lastMatchDate: '2025-04-20', championshipWins: 7, championshipLosses: 1, updatedAt: '2025-04-20' },
  { playerId: 'p8', statType: 'tag', wins: 18, losses: 7, draws: 1, matchesPlayed: 26, winPercentage: 69.2, currentWinStreak: 2, longestWinStreak: 6, longestLossStreak: 2, firstMatchDate: '2023-02-28', lastMatchDate: '2025-04-12', championshipWins: 1, championshipLosses: 1, updatedAt: '2025-04-12' },
  { playerId: 'p8', statType: 'ladder', wins: 7, losses: 3, draws: 1, matchesPlayed: 11, winPercentage: 63.6, currentWinStreak: 1, longestWinStreak: 4, longestLossStreak: 1, firstMatchDate: '2023-04-22', lastMatchDate: '2025-03-25', championshipWins: 1, championshipLosses: 0, updatedAt: '2025-03-25' },
  { playerId: 'p8', statType: 'cage', wins: 5, losses: 2, draws: 0, matchesPlayed: 7, winPercentage: 71.4, currentWinStreak: 2, longestWinStreak: 3, longestLossStreak: 1, firstMatchDate: '2023-07-28', lastMatchDate: '2025-04-01', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-04-01' },

  // Jake / Finn Balor
  { playerId: 'p9', statType: 'overall', wins: 55, losses: 50, draws: 5, matchesPlayed: 110, winPercentage: 50.0, currentWinStreak: 0, longestWinStreak: 5, longestLossStreak: 6, firstMatchDate: '2023-02-10', lastMatchDate: '2025-04-14', championshipWins: 1, championshipLosses: 3, updatedAt: '2025-04-14' },
  { playerId: 'p9', statType: 'singles', wins: 32, losses: 32, draws: 3, matchesPlayed: 67, winPercentage: 47.8, currentWinStreak: 0, longestWinStreak: 4, longestLossStreak: 5, firstMatchDate: '2023-02-10', lastMatchDate: '2025-04-14', championshipWins: 1, championshipLosses: 2, updatedAt: '2025-04-14' },
  { playerId: 'p9', statType: 'tag', wins: 14, losses: 11, draws: 1, matchesPlayed: 26, winPercentage: 53.8, currentWinStreak: 1, longestWinStreak: 3, longestLossStreak: 3, firstMatchDate: '2023-03-20', lastMatchDate: '2025-04-06', championshipWins: 0, championshipLosses: 1, updatedAt: '2025-04-06' },
  { playerId: 'p9', statType: 'ladder', wins: 5, losses: 5, draws: 1, matchesPlayed: 11, winPercentage: 45.5, currentWinStreak: 0, longestWinStreak: 2, longestLossStreak: 3, firstMatchDate: '2023-06-10', lastMatchDate: '2025-03-05', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-03-05' },
  { playerId: 'p9', statType: 'cage', wins: 4, losses: 2, draws: 0, matchesPlayed: 6, winPercentage: 66.7, currentWinStreak: 1, longestWinStreak: 2, longestLossStreak: 1, firstMatchDate: '2023-09-15', lastMatchDate: '2025-02-20', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-02-20' },

  // Kevin / Shawn Michaels
  { playerId: 'p10', statType: 'overall', wins: 68, losses: 44, draws: 3, matchesPlayed: 115, winPercentage: 59.1, currentWinStreak: 2, longestWinStreak: 8, longestLossStreak: 4, firstMatchDate: '2023-01-28', lastMatchDate: '2025-04-18', championshipWins: 4, championshipLosses: 3, updatedAt: '2025-04-18' },
  { playerId: 'p10', statType: 'singles', wins: 42, losses: 26, draws: 2, matchesPlayed: 70, winPercentage: 60.0, currentWinStreak: 1, longestWinStreak: 7, longestLossStreak: 3, firstMatchDate: '2023-01-28', lastMatchDate: '2025-04-18', championshipWins: 3, championshipLosses: 2, updatedAt: '2025-04-18' },
  { playerId: 'p10', statType: 'tag', wins: 16, losses: 10, draws: 0, matchesPlayed: 26, winPercentage: 61.5, currentWinStreak: 1, longestWinStreak: 4, longestLossStreak: 3, firstMatchDate: '2023-03-05', lastMatchDate: '2025-04-09', championshipWins: 1, championshipLosses: 1, updatedAt: '2025-04-09' },
  { playerId: 'p10', statType: 'ladder', wins: 6, losses: 5, draws: 1, matchesPlayed: 12, winPercentage: 50.0, currentWinStreak: 0, longestWinStreak: 3, longestLossStreak: 2, firstMatchDate: '2023-05-15', lastMatchDate: '2025-03-12', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-03-12' },
  { playerId: 'p10', statType: 'cage', wins: 4, losses: 3, draws: 0, matchesPlayed: 7, winPercentage: 57.1, currentWinStreak: 0, longestWinStreak: 2, longestLossStreak: 2, firstMatchDate: '2023-08-10', lastMatchDate: '2025-02-25', championshipWins: 0, championshipLosses: 0, updatedAt: '2025-02-25' },
];

// Head-to-head rivalries
export const mockHeadToHead: HeadToHead[] = [
  {
    matchupKey: 'p1-vs-p2',
    player1Id: 'p1',
    player2Id: 'p2',
    player1Wins: 12,
    player2Wins: 9,
    draws: 2,
    totalMatches: 23,
    lastMatchDate: '2025-04-15',
    lastMatchId: 'm-230',
    championshipMatches: 5,
    recentResults: [
      { matchId: 'm-230', winnerId: 'p1', date: '2025-04-15' },
      { matchId: 'm-218', winnerId: 'p2', date: '2025-03-28' },
      { matchId: 'm-205', winnerId: 'p1', date: '2025-03-10' },
      { matchId: 'm-195', winnerId: 'p1', date: '2025-02-22' },
      { matchId: 'm-180', winnerId: 'p2', date: '2025-02-05' },
    ],
    updatedAt: '2025-04-15',
  },
  {
    matchupKey: 'p8-vs-p3',
    player1Id: 'p8',
    player2Id: 'p3',
    player1Wins: 14,
    player2Wins: 8,
    draws: 1,
    totalMatches: 23,
    lastMatchDate: '2025-04-18',
    lastMatchId: 'm-235',
    championshipMatches: 7,
    recentResults: [
      { matchId: 'm-235', winnerId: 'p8', date: '2025-04-18' },
      { matchId: 'm-220', winnerId: 'p8', date: '2025-03-30' },
      { matchId: 'm-210', winnerId: 'p3', date: '2025-03-15' },
      { matchId: 'm-198', winnerId: 'p8', date: '2025-02-25' },
      { matchId: 'm-185', winnerId: 'p3', date: '2025-02-10' },
    ],
    updatedAt: '2025-04-18',
  },
  {
    matchupKey: 'p1-vs-p8',
    player1Id: 'p1',
    player2Id: 'p8',
    player1Wins: 10,
    player2Wins: 11,
    draws: 3,
    totalMatches: 24,
    lastMatchDate: '2025-04-20',
    lastMatchId: 'm-240',
    championshipMatches: 8,
    recentResults: [
      { matchId: 'm-240', winnerId: 'p8', date: '2025-04-20' },
      { matchId: 'm-225', winnerId: 'p1', date: '2025-04-02' },
      { matchId: 'm-212', winnerId: 'p8', date: '2025-03-18' },
      { matchId: 'm-200', winnerId: 'p1', date: '2025-03-01' },
      { matchId: 'm-188', winnerId: 'p8', date: '2025-02-12' },
    ],
    updatedAt: '2025-04-20',
  },
  {
    matchupKey: 'p5-vs-p6',
    player1Id: 'p5',
    player2Id: 'p6',
    player1Wins: 8,
    player2Wins: 10,
    draws: 2,
    totalMatches: 20,
    lastMatchDate: '2025-04-16',
    lastMatchId: 'm-232',
    championshipMatches: 3,
    recentResults: [
      { matchId: 'm-232', winnerId: 'p6', date: '2025-04-16' },
      { matchId: 'm-215', winnerId: 'p5', date: '2025-03-25' },
      { matchId: 'm-202', winnerId: 'p6', date: '2025-03-08' },
      { matchId: 'm-190', winnerId: 'p6', date: '2025-02-18' },
      { matchId: 'm-178', winnerId: 'p5', date: '2025-02-01' },
    ],
    updatedAt: '2025-04-16',
  },
];

// Championship stats
export const mockChampionshipStats: ChampionshipStats[] = [
  // Tom / Roman Reigns - World Championship
  { playerId: 'p8', championshipId: 'c1', totalReigns: 4, totalDaysHeld: 520, longestReign: 210, shortestReign: 45, totalDefenses: 18, mostDefensesInReign: 8, firstWonDate: '2023-03-15', lastWonDate: '2025-01-20', currentlyHolding: true, updatedAt: '2025-04-20' },
  // John / Stone Cold - World Championship
  { playerId: 'p1', championshipId: 'c1', totalReigns: 3, totalDaysHeld: 380, longestReign: 180, shortestReign: 60, totalDefenses: 14, mostDefensesInReign: 7, firstWonDate: '2023-06-20', lastWonDate: '2024-11-10', currentlyHolding: false, updatedAt: '2025-04-20' },
  // Ryan / John Cena - World Championship
  { playerId: 'p6', championshipId: 'c1', totalReigns: 3, totalDaysHeld: 290, longestReign: 150, shortestReign: 40, totalDefenses: 11, mostDefensesInReign: 5, firstWonDate: '2023-04-10', lastWonDate: '2024-08-15', currentlyHolding: false, updatedAt: '2025-04-20' },
  // Mike / The Rock - Intercontinental Championship
  { playerId: 'p2', championshipId: 'c2', totalReigns: 3, totalDaysHeld: 260, longestReign: 120, shortestReign: 50, totalDefenses: 9, mostDefensesInReign: 4, firstWonDate: '2023-05-01', lastWonDate: '2025-02-10', currentlyHolding: true, updatedAt: '2025-04-20' },
  // Chris / Triple H - World Championship
  { playerId: 'p3', championshipId: 'c1', totalReigns: 2, totalDaysHeld: 200, longestReign: 130, shortestReign: 70, totalDefenses: 8, mostDefensesInReign: 5, firstWonDate: '2023-09-05', lastWonDate: '2024-06-20', currentlyHolding: false, updatedAt: '2025-04-20' },
  // Kevin / Shawn Michaels - Intercontinental Championship
  { playerId: 'p10', championshipId: 'c2', totalReigns: 2, totalDaysHeld: 180, longestReign: 110, shortestReign: 70, totalDefenses: 7, mostDefensesInReign: 4, firstWonDate: '2023-07-15', lastWonDate: '2024-12-01', currentlyHolding: false, updatedAt: '2025-04-20' },
  // Dave / Undertaker - Tag Championship
  { playerId: 'p4', championshipId: 'c3', totalReigns: 2, totalDaysHeld: 160, longestReign: 100, shortestReign: 60, totalDefenses: 6, mostDefensesInReign: 4, firstWonDate: '2023-08-10', lastWonDate: '2024-10-15', currentlyHolding: false, updatedAt: '2025-04-20' },
  // Alex / CM Punk - Intercontinental Championship
  { playerId: 'p5', championshipId: 'c2', totalReigns: 1, totalDaysHeld: 95, longestReign: 95, shortestReign: 95, totalDefenses: 4, mostDefensesInReign: 4, firstWonDate: '2024-04-20', lastWonDate: '2024-04-20', currentlyHolding: false, updatedAt: '2025-04-20' },
];

// Achievements
export const mockAchievements: Achievement[] = [
  // Milestones
  { playerId: 'p1', achievementId: 'a1', achievementName: 'First Victory', achievementType: 'milestone', description: 'Win your first match', earnedAt: '2023-01-15', icon: '🏆' },
  { playerId: 'p1', achievementId: 'a2', achievementName: 'Double Digits', achievementType: 'milestone', description: 'Reach 10 wins', earnedAt: '2023-03-10', icon: '🔟' },
  { playerId: 'p1', achievementId: 'a3', achievementName: 'Half Century', achievementType: 'milestone', description: 'Reach 50 wins', earnedAt: '2024-02-15', icon: '5️⃣' },
  { playerId: 'p8', achievementId: 'a4', achievementName: 'Century Mark', achievementType: 'milestone', description: 'Play 100 matches', earnedAt: '2024-11-20', icon: '💯' },
  { playerId: 'p1', achievementId: 'a5', achievementName: 'Iron Man', achievementType: 'milestone', description: 'Play 100 matches', earnedAt: '2024-10-05', icon: '💯' },

  // Records
  { playerId: 'p8', achievementId: 'a6', achievementName: 'Unstoppable Force', achievementType: 'record', description: 'Win 15 matches in a row', earnedAt: '2024-08-30', icon: '🔥' },
  { playerId: 'p1', achievementId: 'a7', achievementName: 'Dominant Champion', achievementType: 'record', description: 'Hold a championship for 180+ days', earnedAt: '2024-01-15', icon: '👑' },
  { playerId: 'p8', achievementId: 'a8', achievementName: 'Title Collector', achievementType: 'record', description: 'Win championships 9 or more times', earnedAt: '2025-01-20', icon: '🎖️' },
  { playerId: 'p6', achievementId: 'a9', achievementName: 'Grand Slam', achievementType: 'record', description: 'Hold every championship at least once', earnedAt: '2024-09-10', icon: '🏅' },
  { playerId: 'p2', achievementId: 'a10', achievementName: 'The Workhorse', achievementType: 'record', description: 'Compete in every event for a full season', earnedAt: '2024-06-15', icon: '🐴' },

  // Special
  { playerId: 'p8', achievementId: 'a11', achievementName: 'Main Eventer', achievementType: 'special', description: 'Win 5 championship matches in a row', earnedAt: '2024-12-10', icon: '⭐' },
  { playerId: 'p1', achievementId: 'a12', achievementName: 'Cage Master', achievementType: 'special', description: 'Win 5+ cage matches', earnedAt: '2025-01-05', icon: '🔒' },
  { playerId: 'p4', achievementId: 'a13', achievementName: 'Deadman Walking', achievementType: 'special', description: 'Win a match after losing 4 in a row', earnedAt: '2024-07-20', icon: '💀' },
  { playerId: 'p6', achievementId: 'a14', achievementName: 'Never Give Up', achievementType: 'special', description: 'Come back from a 0-5 head-to-head deficit to tie the series', earnedAt: '2024-11-05', icon: '💪' },
  { playerId: 'p2', achievementId: 'a15', achievementName: 'Peoples Champion', achievementType: 'special', description: 'Win 3 different championships', earnedAt: '2025-02-10', icon: '🎤' },
  { playerId: 'p3', achievementId: 'a16', achievementName: 'The Game', achievementType: 'special', description: 'Win a championship match via submission in a cage', earnedAt: '2024-05-18', icon: '🎮' },
  { playerId: 'p10', achievementId: 'a17', achievementName: 'Showstopper', achievementType: 'special', description: 'Win 3 ladder matches in a row', earnedAt: '2024-08-12', icon: '🌟' },
  { playerId: 'p5', achievementId: 'a18', achievementName: 'Best in the World', achievementType: 'milestone', description: 'Achieve a 10+ win streak', earnedAt: '2024-03-22', metadata: { streakLength: 10 }, icon: '🌍' },
];

// All possible achievements (for showing unearned ones grayed out)
export const allAchievements: Omit<Achievement, 'playerId' | 'earnedAt'>[] = [
  { achievementId: 'a1', achievementName: 'First Victory', achievementType: 'milestone', description: 'Win your first match', icon: '🏆' },
  { achievementId: 'a2', achievementName: 'Double Digits', achievementType: 'milestone', description: 'Reach 10 wins', icon: '🔟' },
  { achievementId: 'a3', achievementName: 'Half Century', achievementType: 'milestone', description: 'Reach 50 wins', icon: '5️⃣' },
  { achievementId: 'a4', achievementName: 'Century Mark', achievementType: 'milestone', description: 'Play 100 matches', icon: '💯' },
  { achievementId: 'a5', achievementName: 'Iron Man', achievementType: 'milestone', description: 'Play 100 matches', icon: '💯' },
  { achievementId: 'a18', achievementName: 'Best in the World', achievementType: 'milestone', description: 'Achieve a 10+ win streak', icon: '🌍' },
  { achievementId: 'a6', achievementName: 'Unstoppable Force', achievementType: 'record', description: 'Win 15 matches in a row', icon: '🔥' },
  { achievementId: 'a7', achievementName: 'Dominant Champion', achievementType: 'record', description: 'Hold a championship for 180+ days', icon: '👑' },
  { achievementId: 'a8', achievementName: 'Title Collector', achievementType: 'record', description: 'Win championships 9 or more times', icon: '🎖️' },
  { achievementId: 'a9', achievementName: 'Grand Slam', achievementType: 'record', description: 'Hold every championship at least once', icon: '🏅' },
  { achievementId: 'a10', achievementName: 'The Workhorse', achievementType: 'record', description: 'Compete in every event for a full season', icon: '🐴' },
  { achievementId: 'a11', achievementName: 'Main Eventer', achievementType: 'special', description: 'Win 5 championship matches in a row', icon: '⭐' },
  { achievementId: 'a12', achievementName: 'Cage Master', achievementType: 'special', description: 'Win 5+ cage matches', icon: '🔒' },
  { achievementId: 'a13', achievementName: 'Deadman Walking', achievementType: 'special', description: 'Win a match after losing 4 in a row', icon: '💀' },
  { achievementId: 'a14', achievementName: 'Never Give Up', achievementType: 'special', description: 'Come back from a 0-5 head-to-head deficit to tie the series', icon: '💪' },
  { achievementId: 'a15', achievementName: 'Peoples Champion', achievementType: 'special', description: 'Win 3 different championships', icon: '🎤' },
  { achievementId: 'a16', achievementName: 'The Game', achievementType: 'special', description: 'Win a championship match via submission in a cage', icon: '🎮' },
  { achievementId: 'a17', achievementName: 'Showstopper', achievementType: 'special', description: 'Win 3 ladder matches in a row', icon: '🌟' },
];

// Leaderboard data
export const mockLeaderboards: Record<string, LeaderboardEntry[]> = {
  mostWins: [
    { playerId: 'p1', playerName: 'John', wrestlerName: 'Stone Cold', value: 87, rank: 1 },
    { playerId: 'p2', playerName: 'Mike', wrestlerName: 'The Rock', value: 82, rank: 2 },
    { playerId: 'p8', playerName: 'Tom', wrestlerName: 'Roman Reigns', value: 80, rank: 3 },
    { playerId: 'p6', playerName: 'Ryan', wrestlerName: 'John Cena', value: 78, rank: 4 },
    { playerId: 'p3', playerName: 'Chris', wrestlerName: 'Triple H', value: 74, rank: 5 },
    { playerId: 'p4', playerName: 'Dave', wrestlerName: 'Undertaker', value: 70, rank: 6 },
    { playerId: 'p10', playerName: 'Kevin', wrestlerName: 'Shawn Michaels', value: 68, rank: 7 },
    { playerId: 'p5', playerName: 'Alex', wrestlerName: 'CM Punk', value: 65, rank: 8 },
    { playerId: 'p7', playerName: 'Steve', wrestlerName: 'Edge', value: 60, rank: 9 },
    { playerId: 'p9', playerName: 'Jake', wrestlerName: 'Finn Balor', value: 55, rank: 10 },
  ],
  bestWinPercentage: [
    { playerId: 'p8', playerName: 'Tom', wrestlerName: 'Roman Reigns', value: 70.2, rank: 1 },
    { playerId: 'p1', playerName: 'John', wrestlerName: 'Stone Cold', value: 69.0, rank: 2 },
    { playerId: 'p2', playerName: 'Mike', wrestlerName: 'The Rock', value: 65.1, rank: 3 },
    { playerId: 'p6', playerName: 'Ryan', wrestlerName: 'John Cena', value: 65.0, rank: 4 },
    { playerId: 'p3', playerName: 'Chris', wrestlerName: 'Triple H', value: 61.7, rank: 5 },
    { playerId: 'p4', playerName: 'Dave', wrestlerName: 'Undertaker', value: 59.3, rank: 6 },
    { playerId: 'p10', playerName: 'Kevin', wrestlerName: 'Shawn Michaels', value: 59.1, rank: 7 },
    { playerId: 'p5', playerName: 'Alex', wrestlerName: 'CM Punk', value: 56.5, rank: 8 },
    { playerId: 'p7', playerName: 'Steve', wrestlerName: 'Edge', value: 52.2, rank: 9 },
    { playerId: 'p9', playerName: 'Jake', wrestlerName: 'Finn Balor', value: 50.0, rank: 10 },
  ],
  longestStreak: [
    { playerId: 'p8', playerName: 'Tom', wrestlerName: 'Roman Reigns', value: 15, rank: 1 },
    { playerId: 'p1', playerName: 'John', wrestlerName: 'Stone Cold', value: 12, rank: 2 },
    { playerId: 'p6', playerName: 'Ryan', wrestlerName: 'John Cena', value: 11, rank: 3 },
    { playerId: 'p2', playerName: 'Mike', wrestlerName: 'The Rock', value: 10, rank: 4 },
    { playerId: 'p4', playerName: 'Dave', wrestlerName: 'Undertaker', value: 9, rank: 5 },
    { playerId: 'p3', playerName: 'Chris', wrestlerName: 'Triple H', value: 8, rank: 6 },
    { playerId: 'p10', playerName: 'Kevin', wrestlerName: 'Shawn Michaels', value: 8, rank: 7 },
    { playerId: 'p5', playerName: 'Alex', wrestlerName: 'CM Punk', value: 7, rank: 8 },
    { playerId: 'p7', playerName: 'Steve', wrestlerName: 'Edge', value: 6, rank: 9 },
    { playerId: 'p9', playerName: 'Jake', wrestlerName: 'Finn Balor', value: 5, rank: 10 },
  ],
  mostChampionships: [
    { playerId: 'p8', playerName: 'Tom', wrestlerName: 'Roman Reigns', value: 9, rank: 1 },
    { playerId: 'p1', playerName: 'John', wrestlerName: 'Stone Cold', value: 8, rank: 2 },
    { playerId: 'p6', playerName: 'Ryan', wrestlerName: 'John Cena', value: 7, rank: 3 },
    { playerId: 'p2', playerName: 'Mike', wrestlerName: 'The Rock', value: 6, rank: 4 },
    { playerId: 'p3', playerName: 'Chris', wrestlerName: 'Triple H', value: 5, rank: 5 },
    { playerId: 'p4', playerName: 'Dave', wrestlerName: 'Undertaker', value: 4, rank: 6 },
    { playerId: 'p10', playerName: 'Kevin', wrestlerName: 'Shawn Michaels', value: 4, rank: 7 },
    { playerId: 'p5', playerName: 'Alex', wrestlerName: 'CM Punk', value: 3, rank: 8 },
    { playerId: 'p7', playerName: 'Steve', wrestlerName: 'Edge', value: 2, rank: 9 },
    { playerId: 'p9', playerName: 'Jake', wrestlerName: 'Finn Balor', value: 1, rank: 10 },
  ],
  longestReign: [
    { playerId: 'p8', playerName: 'Tom', wrestlerName: 'Roman Reigns', value: 210, rank: 1 },
    { playerId: 'p1', playerName: 'John', wrestlerName: 'Stone Cold', value: 180, rank: 2 },
    { playerId: 'p6', playerName: 'Ryan', wrestlerName: 'John Cena', value: 150, rank: 3 },
    { playerId: 'p3', playerName: 'Chris', wrestlerName: 'Triple H', value: 130, rank: 4 },
    { playerId: 'p2', playerName: 'Mike', wrestlerName: 'The Rock', value: 120, rank: 5 },
    { playerId: 'p10', playerName: 'Kevin', wrestlerName: 'Shawn Michaels', value: 110, rank: 6 },
    { playerId: 'p4', playerName: 'Dave', wrestlerName: 'Undertaker', value: 100, rank: 7 },
    { playerId: 'p5', playerName: 'Alex', wrestlerName: 'CM Punk', value: 95, rank: 8 },
    { playerId: 'p9', playerName: 'Jake', wrestlerName: 'Finn Balor', value: 55, rank: 9 },
    { playerId: 'p7', playerName: 'Steve', wrestlerName: 'Edge', value: 45, rank: 10 },
  ],
};

// Record book entries
export const mockRecords: Record<string, RecordEntry[]> = {
  overall: [
    { recordName: 'Most Career Wins', holderName: 'John', wrestlerName: 'Stone Cold', value: 87, date: '2025-04-20', description: 'All-time leader in total victories across all match types' },
    { recordName: 'Highest Win Percentage', holderName: 'Tom', wrestlerName: 'Roman Reigns', value: '70.2%', date: '2025-04-20', description: 'Best winning percentage among players with 50+ matches' },
    { recordName: 'Most Matches Played', holderName: 'John', wrestlerName: 'Stone Cold', value: 126, date: '2025-04-20', description: 'Total matches competed in across all types' },
    { recordName: 'Fewest Losses (100+ matches)', holderName: 'Tom', wrestlerName: 'Roman Reigns', value: 30, date: '2025-04-20', description: 'Fewest losses among players with 100+ matches played' },
  ],
  championships: [
    { recordName: 'Most Championship Wins', holderName: 'Tom', wrestlerName: 'Roman Reigns', value: 9, date: '2025-01-20', description: 'Most championship victories across all titles' },
    { recordName: 'Longest Single Reign', holderName: 'Tom', wrestlerName: 'Roman Reigns', value: '210 days', date: '2025-04-20', description: 'Longest consecutive championship reign' },
    { recordName: 'Most Title Defenses', holderName: 'Tom', wrestlerName: 'Roman Reigns', value: 18, date: '2025-04-20', description: 'Most successful title defenses across all reigns' },
    { recordName: 'Most Defenses in Single Reign', holderName: 'Tom', wrestlerName: 'Roman Reigns', value: 8, date: '2024-10-15', description: 'Most title defenses during a single championship reign' },
  ],
  streaks: [
    { recordName: 'Longest Win Streak', holderName: 'Tom', wrestlerName: 'Roman Reigns', value: 15, date: '2024-08-30', description: 'Most consecutive victories without a loss or draw' },
    { recordName: 'Longest Active Win Streak', holderName: 'Tom', wrestlerName: 'Roman Reigns', value: 7, date: '2025-04-20', description: 'Current longest active winning streak' },
    { recordName: 'Longest Loss Streak', holderName: 'Steve', wrestlerName: 'Edge', value: 6, date: '2024-05-10', description: 'Most consecutive losses (a record nobody wants)' },
    { recordName: 'Longest Unbeaten Streak', holderName: 'Tom', wrestlerName: 'Roman Reigns', value: 18, date: '2024-09-15', description: 'Most consecutive matches without a loss (wins + draws)' },
  ],
  matchTypes: [
    { recordName: 'Most Singles Wins', holderName: 'John', wrestlerName: 'Stone Cold', value: 52, date: '2025-04-18', description: 'Most victories in singles competition' },
    { recordName: 'Most Tag Team Wins', holderName: 'Mike', wrestlerName: 'The Rock', value: 22, date: '2025-04-12', description: 'Most victories in tag team matches' },
    { recordName: 'Best Cage Match Record', holderName: 'John', wrestlerName: 'Stone Cold', value: '75.0%', date: '2025-04-20', description: 'Highest win percentage in cage matches (5+ matches)' },
    { recordName: 'Most Ladder Match Wins', holderName: 'John', wrestlerName: 'Stone Cold', value: 9, date: '2025-03-28', description: 'Most victories in ladder matches' },
  ],
};

// Active threats for records
export const mockActiveThreats: {
  recordName: string;
  currentHolder: string;
  currentValue: number | string;
  threatPlayer: string;
  threatValue: number | string;
  gapDescription: string;
}[] = [
  { recordName: 'Most Career Wins', currentHolder: 'John (Stone Cold)', currentValue: 87, threatPlayer: 'Mike (The Rock)', threatValue: 82, gapDescription: '5 wins behind' },
  { recordName: 'Longest Win Streak', currentHolder: 'Tom (Roman Reigns)', currentValue: 15, threatPlayer: 'Tom (Roman Reigns)', threatValue: '7 active', gapDescription: 'Currently on a 7-match streak' },
  { recordName: 'Most Championship Wins', currentHolder: 'Tom (Roman Reigns)', currentValue: 9, threatPlayer: 'John (Stone Cold)', threatValue: 8, gapDescription: '1 title win behind' },
  { recordName: 'Longest Reign', currentHolder: 'Tom (Roman Reigns)', currentValue: '210 days', threatPlayer: 'Tom (Roman Reigns)', threatValue: '91 days active', gapDescription: 'Current reign ongoing' },
];

// Helper to get player stats by playerId and optional statType
export function getPlayerStats(playerId: string, statType?: string): PlayerStatistics[] {
  return mockPlayerStatistics.filter(
    (s) => s.playerId === playerId && (statType ? s.statType === statType : true)
  );
}

// Helper to get head-to-head for two players
export function getHeadToHead(player1Id: string, player2Id: string): HeadToHead | undefined {
  return mockHeadToHead.find(
    (h) =>
      (h.player1Id === player1Id && h.player2Id === player2Id) ||
      (h.player1Id === player2Id && h.player2Id === player1Id)
  );
}

// Helper to get championship stats for a player
export function getChampionshipStats(playerId: string): ChampionshipStats[] {
  return mockChampionshipStats.filter((c) => c.playerId === playerId);
}

// Helper to get achievements for a player
export function getPlayerAchievements(playerId: string): Achievement[] {
  return mockAchievements.filter((a) => a.playerId === playerId);
}

// Helper to get player by id
export function getPlayerById(playerId: string): MockPlayer | undefined {
  return mockPlayers.find((p) => p.playerId === playerId);
}
