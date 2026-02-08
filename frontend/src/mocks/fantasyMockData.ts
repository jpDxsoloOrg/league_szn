import type {
  FantasyUser,
  FantasyPicks,
  WrestlerCost,
  FantasyConfig,
  FantasyLeaderboardEntry,
  WrestlerWithCost,
} from '../types/fantasy';

// Current logged-in fantasy user (for authenticated views)
export const mockCurrentFantasyUser: FantasyUser = {
  fantasyUserId: 'fantasy-user-001',
  username: 'PickMaster2K',
  email: 'pickmaster@example.com',
  totalPoints: 1245,
  currentSeasonPoints: 485,
  perfectPicks: 2,
  currentStreak: 3,
  bestStreak: 5,
  createdAt: '2025-09-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

// Mock seasons for dropdown
export const mockSeasons = [
  { seasonId: 'season-001', name: 'Season 1', status: 'completed' as const },
  { seasonId: 'season-002', name: 'Season 2', status: 'active' as const },
];

// Mock divisions
export const mockDivisions = [
  { divisionId: 'div-raw', name: 'RAW', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
  { divisionId: 'div-smackdown', name: 'SmackDown', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
  { divisionId: 'div-nxt', name: 'NXT', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
];

// Mock shows (kept for reference, components now use real Events API)
export const mockShows = [
  {
    eventId: 'show-001',
    seasonId: 'season-002',
    name: 'Week 1',
    date: '2026-01-15T19:00:00.000Z',
    status: 'completed',
    picksPerDivision: 2,
    budget: 500,
    matchIds: ['match-001', 'match-002', 'match-003', 'match-004'],
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-16T00:00:00.000Z',
  },
  {
    eventId: 'show-002',
    seasonId: 'season-002',
    name: 'Week 2',
    date: '2026-01-22T19:00:00.000Z',
    status: 'completed',
    picksPerDivision: 2,
    budget: 500,
    matchIds: ['match-005', 'match-006', 'match-007', 'match-008'],
    createdAt: '2026-01-17T00:00:00.000Z',
    updatedAt: '2026-01-23T00:00:00.000Z',
  },
  {
    eventId: 'show-003',
    seasonId: 'season-002',
    name: 'Week 3',
    date: '2026-01-29T19:00:00.000Z',
    status: 'completed',
    picksPerDivision: 2,
    budget: 500,
    matchIds: ['match-009', 'match-010', 'match-011', 'match-012'],
    createdAt: '2026-01-24T00:00:00.000Z',
    updatedAt: '2026-01-30T00:00:00.000Z',
  },
  {
    eventId: 'show-004',
    seasonId: 'season-002',
    name: 'Week 4',
    date: '2026-02-05T19:00:00.000Z',
    status: 'open',
    picksPerDivision: 2,
    budget: 500,
    matchIds: ['match-013', 'match-014', 'match-015', 'match-016'],
    createdAt: '2026-01-31T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
  {
    eventId: 'show-005',
    seasonId: 'season-002',
    name: 'Royal Rumble Special',
    date: '2026-02-12T19:00:00.000Z',
    status: 'draft',
    picksPerDivision: 3,
    budget: 750,
    matchIds: [],
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
];

// Mock shows with details for dashboard view
export const mockShowsWithDetails = mockShows.map((show) => ({
  ...show,
  matchCount: show.matchIds.length,
  picksCount: show.status === 'completed' ? 12 : show.status === 'open' ? 8 : 0,
  isUserPicked: show.status === 'completed' || show.eventId === 'show-004',
}));

// Mock wrestler costs
export const mockWrestlerCosts: WrestlerCost[] = [
  // RAW Division
  {
    playerId: 'player-001',
    currentCost: 120,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 110, reason: 'Won match' },
      { date: '2026-01-29', cost: 120, reason: 'Won match' },
    ],
    winRate30Days: 83,
    updatedAt: '2026-01-29T00:00:00.000Z',
  },
  {
    playerId: 'player-002',
    currentCost: 110,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 110, reason: 'Won match' },
    ],
    winRate30Days: 67,
    updatedAt: '2026-01-22T00:00:00.000Z',
  },
  {
    playerId: 'player-003',
    currentCost: 95,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 95, reason: 'Lost match' },
    ],
    winRate30Days: 50,
    updatedAt: '2026-01-22T00:00:00.000Z',
  },
  {
    playerId: 'player-004',
    currentCost: 85,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 90, reason: 'Lost match' },
      { date: '2026-01-29', cost: 85, reason: 'Lost match' },
    ],
    winRate30Days: 33,
    updatedAt: '2026-01-29T00:00:00.000Z',
  },
  // SmackDown Division
  {
    playerId: 'player-005',
    currentCost: 130,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 115, reason: 'Won championship' },
      { date: '2026-01-29', cost: 130, reason: 'Defended title' },
    ],
    winRate30Days: 100,
    updatedAt: '2026-01-29T00:00:00.000Z',
  },
  {
    playerId: 'player-006',
    currentCost: 115,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 110, reason: 'Won match' },
      { date: '2026-01-29', cost: 115, reason: 'Won match' },
    ],
    winRate30Days: 75,
    updatedAt: '2026-01-29T00:00:00.000Z',
  },
  {
    playerId: 'player-007',
    currentCost: 90,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 95, reason: 'Lost match' },
      { date: '2026-01-29', cost: 90, reason: 'Lost match' },
    ],
    winRate30Days: 25,
    updatedAt: '2026-01-29T00:00:00.000Z',
  },
  {
    playerId: 'player-008',
    currentCost: 100,
    baseCost: 100,
    costHistory: [{ date: '2026-01-15', cost: 100, reason: 'Season start' }],
    winRate30Days: 50,
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  // NXT Division
  {
    playerId: 'player-009',
    currentCost: 105,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 105, reason: 'Won match' },
    ],
    winRate30Days: 60,
    updatedAt: '2026-01-22T00:00:00.000Z',
  },
  {
    playerId: 'player-010',
    currentCost: 110,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 105, reason: 'Won match' },
      { date: '2026-01-29', cost: 110, reason: 'Won match' },
    ],
    winRate30Days: 67,
    updatedAt: '2026-01-29T00:00:00.000Z',
  },
  {
    playerId: 'player-011',
    currentCost: 80,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 90, reason: 'Lost match' },
      { date: '2026-01-29', cost: 80, reason: 'Lost match' },
    ],
    winRate30Days: 20,
    updatedAt: '2026-01-29T00:00:00.000Z',
  },
  {
    playerId: 'player-012',
    currentCost: 95,
    baseCost: 100,
    costHistory: [
      { date: '2026-01-15', cost: 100, reason: 'Season start' },
      { date: '2026-01-22', cost: 95, reason: 'Lost match' },
    ],
    winRate30Days: 40,
    updatedAt: '2026-01-22T00:00:00.000Z',
  },
];

// Mock wrestlers with costs (for UI display)
export const mockWrestlersWithCosts: WrestlerWithCost[] = [
  // RAW Division
  {
    playerId: 'player-001',
    name: 'John',
    currentWrestler: 'Stone Cold Steve Austin',
    divisionId: 'div-raw',
    imageUrl: undefined,
    currentCost: 120,
    baseCost: 100,
    costTrend: 'up',
    winRate30Days: 83,
    recentRecord: '5-1',
  },
  {
    playerId: 'player-002',
    name: 'Mike',
    currentWrestler: 'The Rock',
    divisionId: 'div-raw',
    imageUrl: undefined,
    currentCost: 110,
    baseCost: 100,
    costTrend: 'up',
    winRate30Days: 67,
    recentRecord: '4-2',
  },
  {
    playerId: 'player-003',
    name: 'Chris',
    currentWrestler: 'Triple H',
    divisionId: 'div-raw',
    imageUrl: undefined,
    currentCost: 95,
    baseCost: 100,
    costTrend: 'down',
    winRate30Days: 50,
    recentRecord: '3-3',
  },
  {
    playerId: 'player-004',
    name: 'Dave',
    currentWrestler: 'Undertaker',
    divisionId: 'div-raw',
    imageUrl: undefined,
    currentCost: 85,
    baseCost: 100,
    costTrend: 'down',
    winRate30Days: 33,
    recentRecord: '2-4',
  },
  // SmackDown Division
  {
    playerId: 'player-005',
    name: 'Alex',
    currentWrestler: 'CM Punk',
    divisionId: 'div-smackdown',
    imageUrl: undefined,
    currentCost: 130,
    baseCost: 100,
    costTrend: 'up',
    winRate30Days: 100,
    recentRecord: '6-0',
  },
  {
    playerId: 'player-006',
    name: 'Ryan',
    currentWrestler: 'John Cena',
    divisionId: 'div-smackdown',
    imageUrl: undefined,
    currentCost: 115,
    baseCost: 100,
    costTrend: 'up',
    winRate30Days: 75,
    recentRecord: '4-2',
  },
  {
    playerId: 'player-007',
    name: 'Steve',
    currentWrestler: 'Edge',
    divisionId: 'div-smackdown',
    imageUrl: undefined,
    currentCost: 90,
    baseCost: 100,
    costTrend: 'down',
    winRate30Days: 25,
    recentRecord: '1-3',
  },
  {
    playerId: 'player-008',
    name: 'Tom',
    currentWrestler: 'Roman Reigns',
    divisionId: 'div-smackdown',
    imageUrl: undefined,
    currentCost: 100,
    baseCost: 100,
    costTrend: 'stable',
    winRate30Days: 50,
    recentRecord: '3-3',
  },
  // NXT Division
  {
    playerId: 'player-009',
    name: 'Jake',
    currentWrestler: 'Finn Balor',
    divisionId: 'div-nxt',
    imageUrl: undefined,
    currentCost: 105,
    baseCost: 100,
    costTrend: 'up',
    winRate30Days: 60,
    recentRecord: '3-2',
  },
  {
    playerId: 'player-010',
    name: 'Kevin',
    currentWrestler: 'Shawn Michaels',
    divisionId: 'div-nxt',
    imageUrl: undefined,
    currentCost: 110,
    baseCost: 100,
    costTrend: 'up',
    winRate30Days: 67,
    recentRecord: '4-2',
  },
  {
    playerId: 'player-011',
    name: 'Brian',
    currentWrestler: 'Bret Hart',
    divisionId: 'div-nxt',
    imageUrl: undefined,
    currentCost: 80,
    baseCost: 100,
    costTrend: 'down',
    winRate30Days: 20,
    recentRecord: '1-4',
  },
  {
    playerId: 'player-012',
    name: 'Mark',
    currentWrestler: 'Randy Orton',
    divisionId: 'div-nxt',
    imageUrl: undefined,
    currentCost: 95,
    baseCost: 100,
    costTrend: 'down',
    winRate30Days: 40,
    recentRecord: '2-3',
  },
];

// Mock fantasy picks for the current user
export const mockUserPicks: FantasyPicks[] = [
  {
    eventId: 'show-001',
    fantasyUserId: 'fantasy-user-001',
    picks: {
      'div-raw': ['player-001', 'player-002'],
      'div-smackdown': ['player-005', 'player-006'],
      'div-nxt': ['player-009', 'player-010'],
    },
    totalSpent: 480,
    pointsEarned: 85,
    breakdown: {
      'player-001': {
        points: 10,
        basePoints: 10,
        multipliers: ['2-person match (1x)'],
        matchId: 'match-001',
        reason: 'Won match',
      },
      'player-002': {
        points: 20,
        basePoints: 20,
        multipliers: ['3-person match (2x)'],
        matchId: 'match-002',
        reason: 'Won match',
      },
      'player-005': {
        points: 35,
        basePoints: 20,
        multipliers: ['3-person match (2x)', 'Championship match (+5)', 'Won championship (+10)'],
        matchId: 'match-003',
        reason: 'Won match',
      },
      'player-006': {
        points: 0,
        basePoints: 0,
        multipliers: [],
        matchId: 'match-003',
        reason: 'Lost match',
      },
      'player-009': {
        points: 10,
        basePoints: 10,
        multipliers: ['2-person match (1x)'],
        matchId: 'match-004',
        reason: 'Won match',
      },
      'player-010': {
        points: 10,
        basePoints: 10,
        multipliers: ['2-person match (1x)'],
        matchId: 'match-004',
        reason: 'Won match',
      },
    },
    createdAt: '2026-01-14T12:00:00.000Z',
    updatedAt: '2026-01-15T20:00:00.000Z',
  },
  {
    eventId: 'show-002',
    fantasyUserId: 'fantasy-user-001',
    picks: {
      'div-raw': ['player-001', 'player-003'],
      'div-smackdown': ['player-005', 'player-008'],
      'div-nxt': ['player-010', 'player-012'],
    },
    totalSpent: 450,
    pointsEarned: 125,
    breakdown: {
      'player-001': {
        points: 30,
        basePoints: 30,
        multipliers: ['4-person match (3x)'],
        matchId: 'match-005',
        reason: 'Won match',
      },
      'player-003': {
        points: 0,
        basePoints: 0,
        multipliers: [],
        matchId: 'match-005',
        reason: 'Lost match',
      },
      'player-005': {
        points: 25,
        basePoints: 20,
        multipliers: ['3-person match (2x)', 'Championship match (+5)'],
        matchId: 'match-006',
        reason: 'Won match',
      },
      'player-008': {
        points: 20,
        basePoints: 20,
        multipliers: ['3-person match (2x)'],
        matchId: 'match-006',
        reason: 'Won match',
      },
      'player-010': {
        points: 50,
        basePoints: 50,
        multipliers: ['6-person match (5x)'],
        matchId: 'match-007',
        reason: 'Won match',
      },
      'player-012': {
        points: 0,
        basePoints: 0,
        multipliers: [],
        matchId: 'match-007',
        reason: 'Lost match',
      },
    },
    createdAt: '2026-01-21T12:00:00.000Z',
    updatedAt: '2026-01-22T20:00:00.000Z',
  },
  {
    eventId: 'show-003',
    fantasyUserId: 'fantasy-user-001',
    picks: {
      'div-raw': ['player-001', 'player-002'],
      'div-smackdown': ['player-005', 'player-006'],
      'div-nxt': ['player-009', 'player-010'],
    },
    totalSpent: 480,
    pointsEarned: 175,
    breakdown: {
      'player-001': {
        points: 25,
        basePoints: 20,
        multipliers: ['3-person match (2x)', 'Championship match (+5)'],
        matchId: 'match-009',
        reason: 'Won match',
      },
      'player-002': {
        points: 30,
        basePoints: 30,
        multipliers: ['4-person match (3x)'],
        matchId: 'match-010',
        reason: 'Won match',
      },
      'player-005': {
        points: 35,
        basePoints: 20,
        multipliers: ['3-person match (2x)', 'Championship match (+5)', 'Won championship (+10)'],
        matchId: 'match-011',
        reason: 'Won match',
      },
      'player-006': {
        points: 25,
        basePoints: 20,
        multipliers: ['3-person match (2x)', 'Championship match (+5)'],
        matchId: 'match-011',
        reason: 'Won match',
      },
      'player-009': {
        points: 30,
        basePoints: 30,
        multipliers: ['4-person match (3x)'],
        matchId: 'match-012',
        reason: 'Won match',
      },
      'player-010': {
        points: 30,
        basePoints: 30,
        multipliers: ['4-person match (3x)'],
        matchId: 'match-012',
        reason: 'Won match',
      },
    },
    createdAt: '2026-01-28T12:00:00.000Z',
    updatedAt: '2026-01-29T20:00:00.000Z',
  },
  // Current open show - picks in progress
  {
    eventId: 'show-004',
    fantasyUserId: 'fantasy-user-001',
    picks: {
      'div-raw': ['player-001'],
      'div-smackdown': ['player-005', 'player-006'],
      'div-nxt': [],
    },
    totalSpent: 365,
    createdAt: '2026-02-01T12:00:00.000Z',
    updatedAt: '2026-02-01T14:00:00.000Z',
  },
];

// Mock fantasy leaderboard
export const mockFantasyLeaderboard: FantasyLeaderboardEntry[] = [
  {
    rank: 1,
    fantasyUserId: 'fantasy-user-003',
    username: 'WrestleFanatic',
    totalPoints: 1580,
    currentSeasonPoints: 620,
    perfectPicks: 4,
    currentStreak: 7,
  },
  {
    rank: 2,
    fantasyUserId: 'fantasy-user-001',
    username: 'PickMaster2K',
    totalPoints: 1245,
    currentSeasonPoints: 485,
    perfectPicks: 2,
    currentStreak: 3,
  },
  {
    rank: 3,
    fantasyUserId: 'fantasy-user-002',
    username: 'ChampPicker99',
    totalPoints: 1180,
    currentSeasonPoints: 450,
    perfectPicks: 3,
    currentStreak: 0,
  },
  {
    rank: 4,
    fantasyUserId: 'fantasy-user-004',
    username: 'TitleHunterX',
    totalPoints: 1095,
    currentSeasonPoints: 420,
    perfectPicks: 1,
    currentStreak: 2,
  },
  {
    rank: 5,
    fantasyUserId: 'fantasy-user-005',
    username: 'UnderdogLover',
    totalPoints: 985,
    currentSeasonPoints: 380,
    perfectPicks: 0,
    currentStreak: 4,
  },
  {
    rank: 6,
    fantasyUserId: 'fantasy-user-006',
    username: 'RumbleReady',
    totalPoints: 920,
    currentSeasonPoints: 350,
    perfectPicks: 1,
    currentStreak: 1,
  },
  {
    rank: 7,
    fantasyUserId: 'fantasy-user-007',
    username: 'MainEventer',
    totalPoints: 875,
    currentSeasonPoints: 325,
    perfectPicks: 2,
    currentStreak: 0,
  },
  {
    rank: 8,
    fantasyUserId: 'fantasy-user-008',
    username: 'SlamboyJim',
    totalPoints: 810,
    currentSeasonPoints: 290,
    perfectPicks: 0,
    currentStreak: 1,
  },
  {
    rank: 9,
    fantasyUserId: 'fantasy-user-009',
    username: 'SupleXperts',
    totalPoints: 745,
    currentSeasonPoints: 255,
    perfectPicks: 1,
    currentStreak: 0,
  },
  {
    rank: 10,
    fantasyUserId: 'fantasy-user-010',
    username: 'FinisherFan',
    totalPoints: 680,
    currentSeasonPoints: 220,
    perfectPicks: 0,
    currentStreak: 2,
  },
];

// Mock fantasy configuration
export const mockFantasyConfig: FantasyConfig = {
  configKey: 'GLOBAL',
  defaultBudget: 500,
  defaultPicksPerDivision: 2,
  baseWinPoints: 10,
  championshipBonus: 5,
  titleWinBonus: 10,
  titleDefenseBonus: 5,
  costFluctuationEnabled: true,
  costChangePerWin: 10,
  costChangePerLoss: 5,
  costResetStrategy: 'reset',
  underdogMultiplier: 1.5,
  perfectPickBonus: 50,
  streakBonusThreshold: 5,
  streakBonusPoints: 25,
};

// Mock matches for show results
export const mockShowMatches = [
  {
    matchId: 'match-009',
    matchType: 'Triple Threat',
    participants: ['player-001', 'player-003', 'player-004'],
    winners: ['player-001'],
    losers: ['player-003', 'player-004'],
    isChampionship: true,
    status: 'completed',
  },
  {
    matchId: 'match-010',
    matchType: 'Fatal 4-Way',
    participants: ['player-002', 'player-003', 'player-004', 'player-001'],
    winners: ['player-002'],
    losers: ['player-003', 'player-004', 'player-001'],
    isChampionship: false,
    status: 'completed',
  },
  {
    matchId: 'match-011',
    matchType: 'Triple Threat Tag',
    participants: ['player-005', 'player-006', 'player-007', 'player-008'],
    winners: ['player-005', 'player-006'],
    losers: ['player-007', 'player-008'],
    isChampionship: true,
    status: 'completed',
  },
  {
    matchId: 'match-012',
    matchType: 'Fatal 4-Way',
    participants: ['player-009', 'player-010', 'player-011', 'player-012'],
    winners: ['player-009', 'player-010'],
    losers: ['player-011', 'player-012'],
    isChampionship: false,
    status: 'completed',
  },
];

// Helper function to get wrestlers by division
export function getWrestlersByDivision(divisionId: string): WrestlerWithCost[] {
  return mockWrestlersWithCosts.filter((w) => w.divisionId === divisionId);
}

// Helper function to get current open show
export function getCurrentOpenShow() {
  return mockShows.find((s) => s.status === 'open');
}

// Helper function to get user picks for a show
export function getUserPicksForShow(eventId: string): FantasyPicks | undefined {
  return mockUserPicks.find((p) => p.eventId === eventId);
}

// Helper function to get upcoming shows
export function getUpcomingShows() {
  return mockShows.filter((s) => s.status === 'open' || s.status === 'draft');
}

// Helper function to get completed shows
export function getCompletedShows() {
  return mockShows.filter((s) => s.status === 'completed');
}

// Helper function to calculate remaining budget
export function calculateRemainingBudget(
  picks: Record<string, string[]>,
  budget: number
): number {
  let spent = 0;
  Object.values(picks).forEach((playerIds) => {
    playerIds.forEach((playerId) => {
      const wrestler = mockWrestlersWithCosts.find((w) => w.playerId === playerId);
      if (wrestler) {
        spent += wrestler.currentCost;
      }
    });
  });
  return budget - spent;
}
