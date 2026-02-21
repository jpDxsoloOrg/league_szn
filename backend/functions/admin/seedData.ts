import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { badRequest, success, serverError } from '../../lib/response';
import { requireSuperAdmin } from '../../lib/auth';
import { v4 as uuidv4 } from 'uuid';
import {
  EXPORT_SCHEMA_VERSION,
  EXPORT_TABLES,
  type ExportData,
  type SeedImportPayload,
} from './dataTransferConfig';

/** Valid seed module IDs for pick-and-choose (issue 118). When modular seed exists, only these will be run when requested. */
export const SEED_MODULE_IDS = [
  'core',
  'championships',
  'matches',
  'standings',
  'tournaments',
  'events',
  'contenders',
  'fantasy',
  'config',
] as const;
type SeedModuleId = (typeof SEED_MODULE_IDS)[number];

/** Dependency order for seed modules (from plan-modular-seed-data.md). Used to auto-include deps when modular seed is implemented. */
export const SEED_MODULE_ORDER: readonly string[] = [
  'core',
  'championships',
  'matches',
  'standings',
  'tournaments',
  'events',
  'contenders',
  'fantasy',
  'config',
];

interface ParsedSeedRequest {
  mode: 'default' | 'import';
  modules: string[] | null;
  payload?: SeedImportPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseModules(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const modules = value.filter((moduleId): moduleId is string => typeof moduleId === 'string');
  return modules.length > 0 ? modules : null;
}

function parseSeedRequest(body: string | null): { value?: ParsedSeedRequest; error?: string } {
  if (body == null || body === '') {
    return { value: { mode: 'default', modules: null } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { error: 'Request body must be valid JSON' };
  }

  if (!isRecord(parsed)) {
    return { error: 'Request body must be a JSON object' };
  }

  const modeValue = parsed.mode;
  if (modeValue !== undefined && modeValue !== 'default' && modeValue !== 'import') {
    return { error: 'mode must be either "default" or "import"' };
  }
  const mode = modeValue === 'import' ? 'import' : 'default';

  if (mode === 'import') {
    if (parsed.modules !== undefined) {
      return { error: 'modules is not used in import mode; remove modules and provide payload only' };
    }
    const payloadCandidate = isRecord(parsed.payload) ? parsed.payload : parsed;
    const payloadValidation = validateImportPayload(payloadCandidate);
    if (payloadValidation.error) {
      return { error: payloadValidation.error };
    }
    return {
      value: {
        mode: 'import',
        modules: null,
        payload: payloadValidation.value,
      },
    };
  }

  if (parsed.payload !== undefined) {
    return { error: 'payload is only supported when mode is "import"' };
  }

  return {
    value: {
      mode: 'default',
      modules: parseModules(parsed.modules),
    },
  };
}

function validateImportRecordKeys(payload: SeedImportPayload): string | null {
  for (const table of EXPORT_TABLES) {
    const records = payload.data[table.key];
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      const pkValue = record[table.partitionKey];
      if (pkValue === undefined || pkValue === null || pkValue === '') {
        return `Dataset "${table.key}" record at index ${String(index)} is missing required key "${table.partitionKey}"`;
      }

      if (table.sortKey) {
        const skValue = record[table.sortKey];
        if (skValue === undefined || skValue === null || skValue === '') {
          return `Dataset "${table.key}" record at index ${String(index)} is missing required key "${table.sortKey}"`;
        }
      }
    }
  }
  return null;
}

function validateImportPayload(payload: unknown): { value?: SeedImportPayload; error?: string } {
  if (!isRecord(payload)) {
    return { error: 'Import payload must be an object' };
  }

  const version = payload.version;
  if (typeof version !== 'number') {
    return { error: 'Import payload must include numeric version' };
  }

  if (version !== EXPORT_SCHEMA_VERSION) {
    return {
      error: `Unsupported import payload version ${String(version)}. Expected ${String(EXPORT_SCHEMA_VERSION)}`,
    };
  }

  const exportedAt = payload.exportedAt;
  if (typeof exportedAt !== 'string') {
    return { error: 'Import payload must include exportedAt string' };
  }

  const stage = payload.stage;
  if (typeof stage !== 'string') {
    return { error: 'Import payload must include stage string' };
  }

  const data = payload.data;
  if (!isRecord(data)) {
    return { error: 'Import payload must include data object' };
  }

  const normalizedData: Partial<ExportData> = {};
  for (const table of EXPORT_TABLES) {
    const dataset = data[table.key];
    if (!Array.isArray(dataset)) {
      return { error: `Import payload is missing array dataset "${table.key}"` };
    }
    if (!dataset.every(isRecord)) {
      return { error: `Dataset "${table.key}" must contain only objects` };
    }
    normalizedData[table.key] = dataset as Record<string, unknown>[];
  }

  return {
    value: {
      version,
      exportedAt,
      stage,
      data: normalizedData as ExportData,
    },
  };
}

async function deleteAllFromTable(
  tableName: string,
  partitionKey: string,
  sortKey?: string
): Promise<void> {
  const expressionAttributeNames: Record<string, string> = {
    '#pk': partitionKey,
  };
  let projectionExpression = '#pk';

  if (sortKey) {
    expressionAttributeNames['#sk'] = sortKey;
    projectionExpression = `${projectionExpression}, #sk`;
  }

  const items = await dynamoDb.scanAll({
    TableName: tableName,
    ProjectionExpression: projectionExpression,
    ExpressionAttributeNames: expressionAttributeNames,
  });

  for (const item of items) {
    const key: Record<string, unknown> = {
      [partitionKey]: item[partitionKey],
    };
    if (sortKey) {
      key[sortKey] = item[sortKey];
    }
    await dynamoDb.delete({
      TableName: tableName,
      Key: key,
    });
  }
}

async function importPayload(payload: SeedImportPayload): Promise<Record<string, number>> {
  const createdCounts: Record<string, number> = {};
  const keyValidationError = validateImportRecordKeys(payload);
  if (keyValidationError) {
    throw new Error(keyValidationError);
  }

  for (const table of EXPORT_TABLES) {
    await deleteAllFromTable(table.tableName, table.partitionKey, table.sortKey);
  }

  for (const table of EXPORT_TABLES) {
    const records = payload.data[table.key];
    for (const record of records) {
      await dynamoDb.put({
        TableName: table.tableName,
        Item: record,
      });
    }
    createdCounts[table.key] = records.length;
  }

  return createdCounts;
}

function isSeedModuleId(moduleId: string): moduleId is SeedModuleId {
  return (SEED_MODULE_IDS as readonly string[]).includes(moduleId);
}

const wrestlers = [
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

const playerNames = [
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
  'Joe Anoa\'i',
  'Colby Lopez',
];

const stipulations = ['Standard', 'No DQ', 'Steel Cage', 'Ladder Match', 'Hell in a Cell', 'Tables Match'];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function getISOWeekKey(championshipId: string, date: Date): string {
  const year = date.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${championshipId}#${year}-${String(week).padStart(2, '0')}`;
}

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const parsedRequest = parseSeedRequest(event.body ?? null);
  if (parsedRequest.error) {
    return badRequest(parsedRequest.error);
  }

  const request = parsedRequest.value;
  if (request == null) {
    return badRequest('Invalid seed request');
  }

  if (request.mode === 'import') {
    const denied = requireSuperAdmin(event);
    if (denied) {
      return denied;
    }

    try {
      const payload = request.payload;
      if (payload == null) {
        return badRequest('Import payload is required for import mode');
      }

      const createdCounts = await importPayload(payload);

      return success({
        message: 'Data imported successfully!',
        mode: 'import',
        createdCounts,
      });
    } catch (error) {
      console.error('Error importing seed payload:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to import data payload';
      if (errorMessage.includes('Dataset "')) {
        return badRequest(errorMessage);
      }
      return serverError('Failed to import data payload');
    }
  }

  const requestedModules = request.modules;
  // When modular seed is implemented: run only requested modules (with deps auto-included) in SEED_MODULE_ORDER.
  // Until then, we always run the full monolithic seed; requestedModules is accepted but not yet used.
  if (requestedModules != null && requestedModules.length > 0) {
    const valid = requestedModules.filter(isSeedModuleId);
    if (valid.length === 0) {
      return badRequest('Invalid or unknown seed module IDs');
    }
    // TODO: when plan-modular-seed-data.md is done, run only valid modules in dependency order
  }

  try {
    const createdCounts: Record<string, number> = {};
    const now = new Date().toISOString();

    // ── Divisions ──────────────────────────────────────────────
    console.log('Creating divisions...');
    const divisions = [
      {
        divisionId: uuidv4(),
        name: 'Raw',
        description: 'The flagship Monday Night Raw roster',
        createdAt: now,
        updatedAt: now,
      },
      {
        divisionId: uuidv4(),
        name: 'SmackDown',
        description: 'The Friday Night SmackDown roster',
        createdAt: now,
        updatedAt: now,
      },
      {
        divisionId: uuidv4(),
        name: 'NXT',
        description: 'The developmental brand for rising stars',
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const division of divisions) {
      await dynamoDb.put({ TableName: TableNames.DIVISIONS, Item: division });
    }
    createdCounts.divisions = divisions.length;

    // ── Players ────────────────────────────────────────────────
    console.log('Creating players...');
    const players = playerNames.map((name, index) => ({
      playerId: uuidv4(),
      name,
      currentWrestler: wrestlers[index],
      wins: Math.floor(Math.random() * 15) + 3,
      losses: Math.floor(Math.random() * 12) + 2,
      draws: Math.floor(Math.random() * 3),
      divisionId: divisions[index % divisions.length].divisionId,
      createdAt: now,
      updatedAt: now,
    }));

    for (const player of players) {
      await dynamoDb.put({ TableName: TableNames.PLAYERS, Item: player });
    }
    createdCounts.players = players.length;

    // ── Seasons ────────────────────────────────────────────────
    console.log('Creating seasons...');
    const season = {
      seasonId: uuidv4(),
      name: 'Season 1',
      startDate: daysAgo(30).toISOString(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDb.put({ TableName: TableNames.SEASONS, Item: season });
    createdCounts.seasons = 1;

    // ── Season Standings ───────────────────────────────────────
    console.log('Creating season standings...');
    let standingsCount = 0;
    for (const player of players) {
      const standing = {
        seasonId: season.seasonId,
        playerId: player.playerId,
        wins: Math.floor(Math.random() * 8) + 1,
        losses: Math.floor(Math.random() * 6) + 1,
        draws: Math.floor(Math.random() * 2),
        updatedAt: now,
      };
      await dynamoDb.put({ TableName: TableNames.SEASON_STANDINGS, Item: standing });
      standingsCount++;
    }
    createdCounts.seasonStandings = standingsCount;

    // ── Championships ──────────────────────────────────────────
    console.log('Creating championships...');
    const championships = [
      {
        championshipId: uuidv4(),
        name: 'World Heavyweight Championship',
        type: 'singles',
        currentChampion: players[0].playerId,
        divisionId: divisions[0].divisionId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
      {
        championshipId: uuidv4(),
        name: 'Intercontinental Championship',
        type: 'singles',
        currentChampion: players[1].playerId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
      {
        championshipId: uuidv4(),
        name: 'Tag Team Championship',
        type: 'tag',
        currentChampion: [players[2].playerId, players[3].playerId],
        isActive: true,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
      {
        championshipId: uuidv4(),
        name: 'United States Championship',
        type: 'singles',
        currentChampion: players[4].playerId,
        divisionId: divisions[1].divisionId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
    ];

    for (const championship of championships) {
      await dynamoDb.put({ TableName: TableNames.CHAMPIONSHIPS, Item: championship });
    }
    createdCounts.championships = championships.length;

    // ── Championship History ───────────────────────────────────
    console.log('Creating championship history...');
    let historyCount = 0;
    for (let i = 0; i < championships.length; i++) {
      const wonDate = daysAgo(30 - i * 5);
      await dynamoDb.put({
        TableName: TableNames.CHAMPIONSHIP_HISTORY,
        Item: {
          championshipId: championships[i].championshipId,
          wonDate: wonDate.toISOString(),
          champion: championships[i].currentChampion,
          matchId: uuidv4(),
          defenses: Math.floor(Math.random() * 4),
        },
      });
      historyCount++;
    }
    createdCounts.championshipHistory = historyCount;

    // ── Matches ────────────────────────────────────────────────
    console.log('Creating matches...');
    const matches: Record<string, unknown>[] = [];

    // Past completed matches
    for (let i = 0; i < 8; i++) {
      const ago = Math.floor(Math.random() * 25) + 5;
      const matchDate = daysAgo(ago);

      const p1 = players[Math.floor(Math.random() * players.length)];
      let p2 = players[Math.floor(Math.random() * players.length)];
      while (p2.playerId === p1.playerId) {
        p2 = players[Math.floor(Math.random() * players.length)];
      }

      const winner = Math.random() > 0.5 ? p1 : p2;
      const loser = winner === p1 ? p2 : p1;

      matches.push({
        matchId: uuidv4(),
        date: matchDate.toISOString(),
        matchFormat: 'singles',
        stipulation: stipulations[Math.floor(Math.random() * stipulations.length)],
        participants: [p1.playerId, p2.playerId],
        winners: [winner.playerId],
        losers: [loser.playerId],
        isChampionship: false,
        seasonId: season.seasonId,
        status: 'completed',
        createdAt: now,
        version: 1,
      });
    }

    // Future scheduled matches
    for (let i = 0; i < 4; i++) {
      const ahead = Math.floor(Math.random() * 14) + 1;
      const matchDate = daysFromNow(ahead);

      const p1 = players[Math.floor(Math.random() * players.length)];
      let p2 = players[Math.floor(Math.random() * players.length)];
      while (p2.playerId === p1.playerId) {
        p2 = players[Math.floor(Math.random() * players.length)];
      }

      const match: Record<string, unknown> = {
        matchId: uuidv4(),
        date: matchDate.toISOString(),
        matchFormat: i % 2 === 0 ? 'singles' : 'tag',
        stipulation: stipulations[Math.floor(Math.random() * stipulations.length)],
        participants: [p1.playerId, p2.playerId],
        isChampionship: i === 0,
        seasonId: season.seasonId,
        status: 'scheduled',
        createdAt: now,
        version: 1,
      };

      if (i === 0) {
        match.championshipId = championships[0].championshipId;
      }

      matches.push(match);
    }

    for (const match of matches) {
      await dynamoDb.put({ TableName: TableNames.MATCHES, Item: match });
    }
    createdCounts.matches = matches.length;

    // ── Tournaments ────────────────────────────────────────────
    console.log('Creating tournaments...');
    const tournaments = [
      {
        tournamentId: uuidv4(),
        name: 'King of the Ring 2024',
        type: 'single-elimination',
        status: 'in-progress',
        participants: [players[0].playerId, players[1].playerId, players[2].playerId, players[3].playerId],
        brackets: {
          rounds: [
            {
              roundNumber: 1,
              matches: [
                {
                  participant1: players[0].playerId,
                  participant2: players[1].playerId,
                  winner: players[0].playerId,
                },
                {
                  participant1: players[2].playerId,
                  participant2: players[3].playerId,
                  winner: players[2].playerId,
                },
              ],
            },
            {
              roundNumber: 2,
              matches: [
                {
                  participant1: players[0].playerId,
                  participant2: players[2].playerId,
                },
              ],
            },
          ],
        },
        createdAt: now,
        version: 1,
      },
      {
        tournamentId: uuidv4(),
        name: 'G1 Climax 2024',
        type: 'round-robin',
        status: 'in-progress',
        participants: [players[4].playerId, players[5].playerId, players[6].playerId, players[7].playerId],
        standings: {
          [players[4].playerId]: { wins: 2, losses: 1, draws: 0, points: 4 },
          [players[5].playerId]: { wins: 2, losses: 1, draws: 0, points: 4 },
          [players[6].playerId]: { wins: 1, losses: 2, draws: 0, points: 2 },
          [players[7].playerId]: { wins: 1, losses: 2, draws: 0, points: 2 },
        },
        createdAt: now,
        version: 1,
      },
    ];

    for (const tournament of tournaments) {
      await dynamoDb.put({ TableName: TableNames.TOURNAMENTS, Item: tournament });
    }
    createdCounts.tournaments = tournaments.length;

    // ── Events ─────────────────────────────────────────────────
    console.log('Creating events...');
    const completedMatches = matches.filter(m => m.status === 'completed');
    const scheduledMatches = matches.filter(m => m.status === 'scheduled');

    const events = [
      {
        eventId: uuidv4(),
        name: 'WrestleMania 40',
        eventType: 'ppv',
        date: daysFromNow(14).toISOString(),
        venue: 'MetLife Stadium',
        description: 'The Showcase of the Immortals',
        themeColor: '#FFD700',
        status: 'upcoming',
        seasonId: season.seasonId,
        fantasyEnabled: true,
        matchCards: scheduledMatches.slice(0, 3).map((m, idx) => {
          const card: Record<string, unknown> = {
            position: idx + 1,
            matchId: m.matchId,
            designation: idx === 0 ? 'opener' : idx === 2 ? 'main-event' : 'midcard',
          };
          if (m.isChampionship) {
            card.notes = 'Championship Match';
          }
          return card;
        }),
        createdAt: now,
        updatedAt: now,
      },
      {
        eventId: uuidv4(),
        name: 'Monday Night Raw #1580',
        eventType: 'weekly',
        date: daysAgo(7).toISOString(),
        description: 'The longest running weekly episodic television show',
        status: 'completed',
        seasonId: season.seasonId,
        fantasyEnabled: true,
        matchCards: completedMatches.slice(0, 3).map((m, idx) => ({
          position: idx + 1,
          matchId: m.matchId,
          designation: idx === 0 ? 'opener' : idx === 2 ? 'main-event' : 'midcard',
        })),
        createdAt: now,
        updatedAt: now,
      },
      {
        eventId: uuidv4(),
        name: 'Royal Rumble 2026',
        eventType: 'ppv',
        date: daysFromNow(30).toISOString(),
        venue: 'Alamodome',
        description: 'Every man for himself',
        themeColor: '#1E90FF',
        status: 'upcoming',
        seasonId: season.seasonId,
        fantasyEnabled: true,
        matchCards: [],
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const event of events) {
      await dynamoDb.put({ TableName: TableNames.EVENTS, Item: event });
    }
    createdCounts.events = events.length;

    // Link matches back to their events
    for (const m of completedMatches.slice(0, 3)) {
      m.eventId = events[1].eventId;
    }
    for (const m of scheduledMatches.slice(0, 3)) {
      m.eventId = events[0].eventId;
    }
    for (const match of [...completedMatches.slice(0, 3), ...scheduledMatches.slice(0, 3)]) {
      await dynamoDb.put({ TableName: TableNames.MATCHES, Item: match });
    }

    // ── Contender Rankings ─────────────────────────────────────
    console.log('Creating contender rankings...');
    let rankingsCount = 0;

    // WHC rankings (division-locked to Raw)
    const rawPlayers = players.filter(p => p.divisionId === divisions[0].divisionId);
    const whcChampionId = championships[0].currentChampion as string;
    const whcContenders = rawPlayers
      .filter(p => p.playerId !== whcChampionId)
      .slice(0, 3);

    for (let i = 0; i < whcContenders.length; i++) {
      const contender = whcContenders[i];
      const ranking: Record<string, unknown> = {
        championshipId: championships[0].championshipId,
        playerId: contender.playerId,
        rank: i + 1,
        rankingScore: 80 - i * 15,
        winPercentage: 0.6 - i * 0.1,
        currentStreak: 3 - i,
        qualityScore: 70 - i * 10,
        recencyScore: 85 - i * 12,
        matchesInPeriod: 5 + i,
        winsInPeriod: 4 - i,
        peakRank: 1,
        weeksAtTop: i === 0 ? 2 : 0,
        calculatedAt: now,
        updatedAt: now,
      };
      if (i <= 1) {
        ranking.previousRank = i === 0 ? 2 : 1;
      }
      await dynamoDb.put({ TableName: TableNames.CONTENDER_RANKINGS, Item: ranking });
      rankingsCount++;
    }

    // IC rankings (open, no division lock)
    const icChampionId = championships[1].currentChampion as string;
    const icContenders = players
      .filter(p => p.playerId !== icChampionId)
      .slice(0, 5);

    for (let i = 0; i < icContenders.length; i++) {
      const contender = icContenders[i];
      const ranking: Record<string, unknown> = {
        championshipId: championships[1].championshipId,
        playerId: contender.playerId,
        rank: i + 1,
        rankingScore: 90 - i * 12,
        winPercentage: 0.7 - i * 0.08,
        currentStreak: 4 - i,
        qualityScore: 75 - i * 8,
        recencyScore: 88 - i * 10,
        matchesInPeriod: 6 + i,
        winsInPeriod: 5 - i,
        peakRank: Math.max(1, i),
        weeksAtTop: i === 0 ? 3 : 0,
        calculatedAt: now,
        updatedAt: now,
      };
      if (i + 1 <= 3) {
        ranking.previousRank = i + 2;
      }
      await dynamoDb.put({ TableName: TableNames.CONTENDER_RANKINGS, Item: ranking });
      rankingsCount++;
    }
    createdCounts.contenderRankings = rankingsCount;

    // ── Ranking History ────────────────────────────────────────
    console.log('Creating ranking history...');
    let historyEntries = 0;
    for (let weekOffset = 0; weekOffset < 3; weekOffset++) {
      const weekDate = daysAgo(weekOffset * 7);
      for (let i = 0; i < 3; i++) {
        const contender = icContenders[i];
        const weekKey = getISOWeekKey(championships[1].championshipId, weekDate);
        await dynamoDb.put({
          TableName: TableNames.RANKING_HISTORY,
          Item: {
            playerId: contender.playerId,
            weekKey,
            championshipId: championships[1].championshipId,
            rank: i + 1 + (weekOffset === 2 ? 1 : 0),
            rankingScore: 90 - i * 12 - weekOffset * 3,
            movement: weekOffset === 0 ? (i === 0 ? 1 : -1) : 0,
            createdAt: weekDate.toISOString(),
          },
        });
        historyEntries++;
      }
    }
    createdCounts.rankingHistory = historyEntries;

    // ── Fantasy Config ─────────────────────────────────────────
    console.log('Creating fantasy config...');
    await dynamoDb.put({
      TableName: TableNames.FANTASY_CONFIG,
      Item: {
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
      },
    });
    createdCounts.fantasyConfig = 1;

    // ── Wrestler Costs ─────────────────────────────────────────
    console.log('Creating wrestler costs...');
    let costsCount = 0;
    for (const player of players) {
      const totalMatches = player.wins + player.losses + player.draws;
      const winRate = totalMatches > 0 ? Math.round((player.wins / totalMatches) * 100) : 0;
      const baseCost = 100;
      const costAdjustment = Math.round((winRate - 50) * 1.5);
      const currentCost = Math.max(50, baseCost + costAdjustment);

      await dynamoDb.put({
        TableName: TableNames.WRESTLER_COSTS,
        Item: {
          playerId: player.playerId,
          baseCost,
          currentCost,
          costHistory: [
            {
              date: daysAgo(7).toISOString().split('T')[0],
              cost: baseCost,
              reason: 'Initial cost set',
            },
            {
              date: new Date().toISOString().split('T')[0],
              cost: currentCost,
              reason: 'Performance adjustment',
            },
          ],
          winRate30Days: winRate,
          recentRecord: `${player.wins}-${player.losses}-${player.draws}`,
          updatedAt: now,
        },
      });
      costsCount++;
    }
    createdCounts.wrestlerCosts = costsCount;

    // ── Challenges ────────────────────────────────────────────
    console.log('Creating challenges...');
    const challengeData = [
      {
        challengerId: players[0].playerId, // Stone Cold
        challengedId: players[1].playerId, // The Rock
        matchType: 'Singles',
        stipulation: 'No DQ',
        message: 'You think you can just waltz in here and take MY spotlight? I challenge you to settle this once and for all!',
        status: 'pending',
        daysAgoCreated: 2,
        expiresInDays: 5,
      },
      {
        challengerId: players[10].playerId, // Roman Reigns
        challengedId: players[6].playerId, // John Cena
        matchType: 'Singles',
        stipulation: 'Steel Cage',
        championshipId: championships[0].championshipId,
        message: 'Acknowledge me or face the consequences inside the steel cage. Your time is up!',
        status: 'accepted',
        responseMessage: 'You want some? Come get some! I accept your challenge. The champ is HERE!',
        daysAgoCreated: 5,
        expiresInDays: 2,
      },
      {
        challengerId: players[9].playerId, // CM Punk
        challengedId: players[11].playerId, // Seth Rollins
        matchType: 'Singles',
        message: 'Best in the world vs the so-called architect. Let\'s see who really builds the future.',
        status: 'pending',
        daysAgoCreated: 1,
        expiresInDays: 6,
      },
      {
        challengerId: players[4].playerId, // Shawn Michaels
        challengedId: players[5].playerId, // Bret Hart
        matchType: 'Singles',
        stipulation: 'Iron Man',
        message: 'One more time, Bret. 60 minutes. The boyhood dream lives on!',
        status: 'declined',
        responseMessage: 'I have nothing left to prove against you, Shawn. Find someone else.',
        daysAgoCreated: 10,
        expiresInDays: -3,
      },
      {
        challengerId: players[3].playerId, // Triple H
        challengedId: players[2].playerId, // Undertaker
        matchType: 'Singles',
        stipulation: 'Hell in a Cell',
        message: 'End of an era? No. This is just the beginning. Meet me in the Cell, Deadman.',
        status: 'countered',
        responseMessage: 'I accept your challenge, but on MY terms.',
        daysAgoCreated: 7,
        expiresInDays: 0,
      },
    ];

    let challengeCount = 0;
    const challengeIds: string[] = [];
    for (const cd of challengeData) {
      const challengeId = uuidv4();
      challengeIds.push(challengeId);
      await dynamoDb.put({
        TableName: TableNames.CHALLENGES,
        Item: {
          challengeId,
          challengerId: cd.challengerId,
          challengedId: cd.challengedId,
          matchType: cd.matchType,
          ...(cd.stipulation && { stipulation: cd.stipulation }),
          ...(cd.championshipId && { championshipId: cd.championshipId }),
          ...(cd.message && { message: cd.message }),
          status: cd.status,
          ...(cd.responseMessage && { responseMessage: cd.responseMessage }),
          expiresAt: daysFromNow(cd.expiresInDays).toISOString(),
          createdAt: daysAgo(cd.daysAgoCreated).toISOString(),
          updatedAt: daysAgo(cd.status === 'pending' ? cd.daysAgoCreated : cd.daysAgoCreated - 1).toISOString(),
        },
      });
      challengeCount++;
    }

    // Create the counter challenge for Triple H vs Undertaker
    const counterChallengeId = uuidv4();
    await dynamoDb.put({
      TableName: TableNames.CHALLENGES,
      Item: {
        challengeId: counterChallengeId,
        challengerId: players[2].playerId, // Undertaker counters
        challengedId: players[3].playerId, // back to Triple H
        matchType: 'Singles',
        stipulation: 'Last Man Standing',
        message: 'Last Man Standing. No escape. Only one of us walks out.',
        status: 'pending',
        expiresAt: daysFromNow(5).toISOString(),
        createdAt: daysAgo(6).toISOString(),
        updatedAt: daysAgo(6).toISOString(),
      },
    });
    challengeCount++;

    // Update the countered challenge to link to the counter
    await dynamoDb.update({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId: challengeIds[4] },
      UpdateExpression: 'SET counteredChallengeId = :ccid',
      ExpressionAttributeValues: { ':ccid': counterChallengeId },
    });

    createdCounts.challenges = challengeCount;

    // ── Promos ────────────────────────────────────────────────
    console.log('Creating promos...');
    const defaultReactionCounts = { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 };

    const promoData = [
      {
        playerId: players[0].playerId, // Stone Cold
        promoType: 'open-mic',
        title: 'Austin 3:16 Says...',
        content: 'Let me tell you something about this league. Every single one of you back there thinks you\'re tough, thinks you can hang with the Texas Rattlesnake. I\'ve been busting skulls since day one and I ain\'t about to stop now. If you want a piece of Stone Cold, come and get it. But I promise you, you will regret the day you stepped into my ring. And that\'s the bottom line, because Stone Cold said so!',
        isPinned: true,
        reactionCounts: { fire: 8, mic: 5, trash: 1, 'mind-blown': 3, clap: 6 },
        daysAgo: 3,
      },
      {
        playerId: players[1].playerId, // The Rock
        promoType: 'call-out',
        title: 'Finally... The Rock HAS COME BACK',
        content: 'IT DOESN\'T MATTER what your name is! The Rock has come back to lay the smackdown on every single jabroni in this league. And The Rock says this: @Stone Cold, you think you run things around here? The People\'s Champ has something to say about that. So The Rock says, know your role and shut your mouth, or The Rock will layeth the smacketh down on your candy... you know the rest!',
        targetPlayerId: players[0].playerId,
        reactionCounts: { fire: 12, mic: 7, trash: 0, 'mind-blown': 4, clap: 9 },
        daysAgo: 2,
      },
      {
        playerId: players[0].playerId, // Stone Cold response
        promoType: 'response',
        title: 'The Rattlesnake Strikes Back',
        content: 'Rock, you wanna run your mouth? That\'s fine by me. But let me remind you of something: every time we\'ve gone toe to toe, I\'ve handed you a can of whoop-ass so fresh it still had the expiration date on it. You want to talk about laying smackdowns? The only thing getting laid down is you, flat on your back, staring at the lights while I celebrate with a cold one. DTA - Don\'t Trust Anybody, especially a Hollywood prima donna like yourself.',
        targetPlayerId: players[1].playerId,
        reactionCounts: { fire: 10, mic: 6, trash: 2, 'mind-blown': 5, clap: 8 },
        daysAgo: 1,
      },
      {
        playerId: players[10].playerId, // Roman Reigns
        promoType: 'championship',
        title: 'Acknowledge Your Tribal Chief',
        content: 'Let me make one thing perfectly clear to everyone in that locker room. I am your Tribal Chief. I am the Head of the Table. The title around my waist isn\'t just a championship - it\'s a reminder that I\'m on another level. Nobody in this league can touch me. Not Cena, not Punk, not anyone. When I walk into that arena, you don\'t just watch - you acknowledge. That isn\'t a request. It\'s an order.',
        championshipId: championships[0].championshipId,
        reactionCounts: { fire: 6, mic: 4, trash: 5, 'mind-blown': 2, clap: 3 },
        daysAgo: 4,
      },
      {
        playerId: players[6].playerId, // John Cena
        promoType: 'pre-match',
        title: 'The Champ Is Here',
        content: 'Roman, you call yourself a Tribal Chief? I call you a bully who hides behind his family. But this Sunday, there\'s no family to save you, no special counsel to bail you out. It\'s just you and me inside a steel cage, and I promise you this: hustle, loyalty, and respect aren\'t just words - they\'re a way of life. And my way of life is about to end your little reign of terror. The champ... is... HERE!',
        targetPlayerId: players[10].playerId,
        reactionCounts: { fire: 7, mic: 3, trash: 3, 'mind-blown': 1, clap: 7 },
        daysAgo: 3,
      },
      {
        playerId: players[9].playerId, // CM Punk
        promoType: 'open-mic',
        title: 'Pipe Bomb 2.0',
        content: 'I sat in my house for a long time, and I watched this league coast on mediocrity. The same recycled storylines, the same tired faces in the main event. Well, the Best in the World is back, and I didn\'t come here to play nice. I came here to shake things up, to be the voice of the voiceless, and to prove that this so-called new era is nothing without CM Punk. I\'m not asking for a spot at the table - I\'m kicking the table over and building a new one.',
        reactionCounts: { fire: 15, mic: 9, trash: 1, 'mind-blown': 8, clap: 11 },
        daysAgo: 5,
      },
      {
        playerId: players[2].playerId, // Undertaker
        promoType: 'return',
        title: 'The Deadman Walks Again',
        content: 'You thought I was gone. You thought the darkness had finally consumed the Deadman. But Death Valley isn\'t a final resting place - it\'s where legends are reborn. I\'ve heard the whispers backstage, the disrespect from a new generation that doesn\'t understand what true power looks like. Let me remind you all: I am The Undertaker. And when the bell tolls, it tolls for thee. Rest... in... peace.',
        reactionCounts: { fire: 9, mic: 4, trash: 0, 'mind-blown': 11, clap: 7 },
        daysAgo: 6,
      },
    ];

    let promoCount = 0;
    const promoIds: string[] = [];
    for (const pd of promoData) {
      const promoId = uuidv4();
      promoIds.push(promoId);
      await dynamoDb.put({
        TableName: TableNames.PROMOS,
        Item: {
          promoId,
          playerId: pd.playerId,
          promoType: pd.promoType,
          ...(pd.title && { title: pd.title }),
          content: pd.content,
          ...(pd.targetPlayerId && { targetPlayerId: pd.targetPlayerId }),
          ...(pd.championshipId && { championshipId: pd.championshipId }),
          reactions: {},
          reactionCounts: pd.reactionCounts || defaultReactionCounts,
          isPinned: pd.isPinned || false,
          isHidden: false,
          createdAt: daysAgo(pd.daysAgo).toISOString(),
          updatedAt: daysAgo(pd.daysAgo).toISOString(),
        },
      });
      promoCount++;
    }

    // Link the response promo (index 2) to the call-out promo (index 1)
    await dynamoDb.update({
      TableName: TableNames.PROMOS,
      Key: { promoId: promoIds[2] },
      UpdateExpression: 'SET targetPromoId = :tpid',
      ExpressionAttributeValues: { ':tpid': promoIds[1] },
    });

    createdCounts.promos = promoCount;

    // ── Site Config ────────────────────────────────────────────
    console.log('Creating site config...');
    await dynamoDb.put({
      TableName: TableNames.SITE_CONFIG,
      Item: {
        configKey: 'features',
        features: {
          fantasy: true,
          challenges: true,
          promos: true,
          contenders: true,
          statistics: true,
        },
        updatedAt: now,
      },
    });
    createdCounts.siteConfig = 1;

    // ── Match Types ─────────────────────────────────────────────
    console.log('Creating match types...');
    const defaultMatchTypes = ['Singles', 'Tag Team', 'Triple Threat', 'Fatal 4-Way', '6-Pack Challenge', 'Battle Royal'];
    for (const name of defaultMatchTypes) {
      await dynamoDb.put({
        TableName: TableNames.MATCH_TYPES,
        Item: {
          matchTypeId: uuidv4(),
          name,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    createdCounts.matchTypes = defaultMatchTypes.length;

    return success({
      message: 'Sample data seeded successfully!',
      createdCounts,
    });
  } catch (err) {
    console.error('Error seeding data:', err);
    return serverError('Failed to seed data');
  }
};
