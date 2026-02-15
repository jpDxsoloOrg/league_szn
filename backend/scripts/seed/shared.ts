import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

// ── Environment ────────────────────────────────────────────────────
export const STAGE = process.env.STAGE || 'offline';
const isLocal = process.env.IS_OFFLINE === 'true' || STAGE === 'offline';

// ── DynamoDB Client ────────────────────────────────────────────────
const client = new DynamoDBClient(
  isLocal
    ? {
        region: 'us-east-1',
        endpoint: 'http://localhost:8000',
        credentials: {
          accessKeyId: 'dummy',
          secretAccessKey: 'dummy',
        },
      }
    : { region: 'us-east-1' }
);

export const docClient = DynamoDBDocumentClient.from(client);

// ── Table Names ────────────────────────────────────────────────────
export const TABLES = {
  PLAYERS: `wwe-2k-league-api-players-${STAGE}`,
  MATCHES: `wwe-2k-league-api-matches-${STAGE}`,
  CHAMPIONSHIPS: `wwe-2k-league-api-championships-${STAGE}`,
  CHAMPIONSHIP_HISTORY: `wwe-2k-league-api-championship-history-${STAGE}`,
  TOURNAMENTS: `wwe-2k-league-api-tournaments-${STAGE}`,
  SEASONS: `wwe-2k-league-api-seasons-${STAGE}`,
  SEASON_STANDINGS: `wwe-2k-league-api-season-standings-${STAGE}`,
  DIVISIONS: `wwe-2k-league-api-divisions-${STAGE}`,
  EVENTS: `wwe-2k-league-api-events-${STAGE}`,
  CONTENDER_RANKINGS: `wwe-2k-league-api-contender-rankings-${STAGE}`,
  RANKING_HISTORY: `wwe-2k-league-api-ranking-history-${STAGE}`,
  FANTASY_CONFIG: `wwe-2k-league-api-fantasy-config-${STAGE}`,
  WRESTLER_COSTS: `wwe-2k-league-api-wrestler-costs-${STAGE}`,
  FANTASY_PICKS: `wwe-2k-league-api-fantasy-picks-${STAGE}`,
  SITE_CONFIG: `wwe-2k-league-api-site-config-${STAGE}`,
};

// ── Helper Functions ───────────────────────────────────────────────
export function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export function getISOWeekKey(championshipId: string, date: Date): string {
  const year = date.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${championshipId}#${year}-${String(week).padStart(2, '0')}`;
}

export async function putItem(tableName: string, item: Record<string, unknown>): Promise<void> {
  try {
    await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ Failed to put item in ${tableName}:`, message);
    console.error('  Item keys:', JSON.stringify(Object.keys(item)));
    throw err;
  }
}

export async function updateItem(
  tableName: string,
  key: Record<string, unknown>,
  updateExpression: string,
  expressionAttributeNames: Record<string, string>,
  expressionAttributeValues: Record<string, unknown>,
): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ Failed to update item in ${tableName}:`, message);
    throw err;
  }
}

// ── Fixed Deterministic IDs ────────────────────────────────────────
// Using valid UUID v4 format with deterministic values for reproducibility.

export const DIVISION_IDS = {
  raw: 'd1000000-0000-4000-8000-000000000001',
  smackdown: 'd1000000-0000-4000-8000-000000000002',
  nxt: 'd1000000-0000-4000-8000-000000000003',
};

export const PLAYER_IDS = [
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005',
  'a1000000-0000-4000-8000-000000000006',
  'a1000000-0000-4000-8000-000000000007',
  'a1000000-0000-4000-8000-000000000008',
  'a1000000-0000-4000-8000-000000000009',
  'a1000000-0000-4000-8000-00000000000a',
  'a1000000-0000-4000-8000-00000000000b',
  'a1000000-0000-4000-8000-00000000000c',
];

export const SEASON_IDS = {
  season1: 'b1000000-0000-4000-8000-000000000001',
};

export const CHAMPIONSHIP_IDS = {
  worldHeavyweight: 'c1000000-0000-4000-8000-000000000001',
  intercontinental: 'c1000000-0000-4000-8000-000000000002',
  tagTeam: 'c1000000-0000-4000-8000-000000000003',
  unitedStates: 'c1000000-0000-4000-8000-000000000004',
};

export const MATCH_IDS = [
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002',
  'e1000000-0000-4000-8000-000000000003',
  'e1000000-0000-4000-8000-000000000004',
  'e1000000-0000-4000-8000-000000000005',
  'e1000000-0000-4000-8000-000000000006',
  'e1000000-0000-4000-8000-000000000007',
  'e1000000-0000-4000-8000-000000000008',
  'e1000000-0000-4000-8000-000000000009',
  'e1000000-0000-4000-8000-00000000000a',
  'e1000000-0000-4000-8000-00000000000b',
  'e1000000-0000-4000-8000-00000000000c',
];

export const TOURNAMENT_IDS = {
  kotr: 'f1000000-0000-4000-8000-000000000001',
  g1: 'f1000000-0000-4000-8000-000000000002',
};

export const EVENT_IDS = {
  wrestlemania: '10000000-0000-4000-8000-000000000001',
  raw: '10000000-0000-4000-8000-000000000002',
  rumble: '10000000-0000-4000-8000-000000000003',
};

// ── Static Data Arrays ─────────────────────────────────────────────

export const WRESTLERS = [
  'Stone Cold Steve Austin',
  'The Rock',
  'The Undertaker',
  'Triple H',
  'Shawn Michaels',
  'Bret Hart',
  'John Cena',
  'Randy Orton',
  'Edge',
  'CM Punk',
  'Roman Reigns',
  'Seth Rollins',
];

export const PLAYER_NAMES = [
  'John Stone',
  'Mike Rock',
  'Jake Undertaker',
  'Chris Helmsley',
  'Alex Michaels',
  'Sam Hart',
  'Dave Cena',
  'Randy Legend',
  'Adam Copeland',
  'Phil Brooks',
  "Joe Anoa'i",
  'Colby Lopez',
];

export const STIPULATIONS = [
  'Standard',
  'No DQ',
  'Steel Cage',
  'Ladder Match',
  'Hell in a Cell',
  'Tables Match',
];

// Division assignments: players round-robin across 3 divisions (4 per division)
const divisionOrder = [DIVISION_IDS.raw, DIVISION_IDS.smackdown, DIVISION_IDS.nxt];
export const PLAYER_DIVISION_MAP: Record<string, string> = {};
for (let i = 0; i < PLAYER_IDS.length; i++) {
  PLAYER_DIVISION_MAP[PLAYER_IDS[i]] = divisionOrder[i % 3];
}

// ── Match Definitions (deterministic outcomes) ─────────────────────
// These define the exact match outcomes so that player stats, season standings,
// championship history, and wrestler costs can all be derived consistently.

export interface MatchDefinition {
  matchId: string;
  daysOffset: number; // negative = past, positive = future
  matchType: 'singles' | 'tag';
  stipulation: string;
  participants: string[];
  winners?: string[];
  losers?: string[];
  isChampionship: boolean;
  championshipId?: string;
  status: 'completed' | 'scheduled';
}

export const MATCH_DEFINITIONS: MatchDefinition[] = [
  // ── 8 Completed Matches (past) ─────────────────────────────────
  {
    matchId: MATCH_IDS[0],
    daysOffset: -25,
    matchType: 'singles',
    stipulation: 'Standard',
    participants: [PLAYER_IDS[0], PLAYER_IDS[1]],
    winners: [PLAYER_IDS[0]],
    losers: [PLAYER_IDS[1]],
    isChampionship: true,
    championshipId: CHAMPIONSHIP_IDS.worldHeavyweight,
    status: 'completed',
  },
  {
    matchId: MATCH_IDS[1],
    daysOffset: -22,
    matchType: 'singles',
    stipulation: 'Steel Cage',
    participants: [PLAYER_IDS[4], PLAYER_IDS[8]],
    winners: [PLAYER_IDS[4]],
    losers: [PLAYER_IDS[8]],
    isChampionship: true,
    championshipId: CHAMPIONSHIP_IDS.unitedStates,
    status: 'completed',
  },
  {
    matchId: MATCH_IDS[2],
    daysOffset: -20,
    matchType: 'singles',
    stipulation: 'No DQ',
    participants: [PLAYER_IDS[1], PLAYER_IDS[9]],
    winners: [PLAYER_IDS[1]],
    losers: [PLAYER_IDS[9]],
    isChampionship: true,
    championshipId: CHAMPIONSHIP_IDS.intercontinental,
    status: 'completed',
  },
  {
    matchId: MATCH_IDS[3],
    daysOffset: -18,
    matchType: 'tag',
    stipulation: 'Standard',
    participants: [PLAYER_IDS[2], PLAYER_IDS[3], PLAYER_IDS[10], PLAYER_IDS[11]],
    winners: [PLAYER_IDS[2], PLAYER_IDS[3]],
    losers: [PLAYER_IDS[10], PLAYER_IDS[11]],
    isChampionship: true,
    championshipId: CHAMPIONSHIP_IDS.tagTeam,
    status: 'completed',
  },
  {
    matchId: MATCH_IDS[4],
    daysOffset: -15,
    matchType: 'singles',
    stipulation: 'Ladder Match',
    participants: [PLAYER_IDS[5], PLAYER_IDS[6]],
    winners: [PLAYER_IDS[5]],
    losers: [PLAYER_IDS[6]],
    isChampionship: false,
    status: 'completed',
  },
  {
    matchId: MATCH_IDS[5],
    daysOffset: -12,
    matchType: 'singles',
    stipulation: 'Hell in a Cell',
    participants: [PLAYER_IDS[7], PLAYER_IDS[0]],
    winners: [PLAYER_IDS[7]],
    losers: [PLAYER_IDS[0]],
    isChampionship: false,
    status: 'completed',
  },
  {
    matchId: MATCH_IDS[6],
    daysOffset: -8,
    matchType: 'singles',
    stipulation: 'Tables Match',
    participants: [PLAYER_IDS[3], PLAYER_IDS[6]],
    winners: [PLAYER_IDS[3]],
    losers: [PLAYER_IDS[6]],
    isChampionship: false,
    status: 'completed',
  },
  {
    matchId: MATCH_IDS[7],
    daysOffset: -5,
    matchType: 'singles',
    stipulation: 'Standard',
    participants: [PLAYER_IDS[11], PLAYER_IDS[2]],
    winners: [PLAYER_IDS[11]],
    losers: [PLAYER_IDS[2]],
    isChampionship: false,
    status: 'completed',
  },

  // ── 4 Scheduled Matches (future) ───────────────────────────────
  {
    matchId: MATCH_IDS[8],
    daysOffset: 3,
    matchType: 'singles',
    stipulation: 'Standard',
    participants: [PLAYER_IDS[0], PLAYER_IDS[3]],
    isChampionship: true,
    championshipId: CHAMPIONSHIP_IDS.worldHeavyweight,
    status: 'scheduled',
  },
  {
    matchId: MATCH_IDS[9],
    daysOffset: 7,
    matchType: 'tag',
    stipulation: 'No DQ',
    participants: [PLAYER_IDS[2], PLAYER_IDS[5], PLAYER_IDS[7], PLAYER_IDS[8]],
    isChampionship: false,
    status: 'scheduled',
  },
  {
    matchId: MATCH_IDS[10],
    daysOffset: 10,
    matchType: 'singles',
    stipulation: 'Steel Cage',
    participants: [PLAYER_IDS[1], PLAYER_IDS[4]],
    isChampionship: false,
    status: 'scheduled',
  },
  {
    matchId: MATCH_IDS[11],
    daysOffset: 14,
    matchType: 'singles',
    stipulation: 'Ladder Match',
    participants: [PLAYER_IDS[9], PLAYER_IDS[11]],
    isChampionship: false,
    status: 'scheduled',
  },
];

// ── Computed Player Stats (derived from match outcomes) ────────────
// These are the ground truth: if a match says player X won, these stats reflect it.

export interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
}

function computePlayerStats(): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {};

  for (const id of PLAYER_IDS) {
    stats[id] = { wins: 0, losses: 0, draws: 0 };
  }

  const completedMatches = MATCH_DEFINITIONS.filter(m => m.status === 'completed');
  for (const match of completedMatches) {
    for (const winnerId of match.winners ?? []) {
      stats[winnerId].wins++;
    }
    for (const loserId of match.losers ?? []) {
      stats[loserId].losses++;
    }
  }

  return stats;
}

export const COMPUTED_PLAYER_STATS = computePlayerStats();
