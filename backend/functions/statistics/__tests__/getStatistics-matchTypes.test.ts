import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockScanAll } = vi.hoisted(() => ({
  mockScanAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: vi.fn(),
    put: vi.fn(),
    scan: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: mockScanAll,
    queryAll: vi.fn(),
  },
  TableNames: {
    PLAYERS: 'Players',
    MATCHES: 'Matches',
    CHAMPIONSHIPS: 'Championships',
    CHAMPIONSHIP_HISTORY: 'ChampionshipHistory',
    MATCH_TYPES: 'MatchTypes',
    STIPULATIONS: 'Stipulations',
    STABLES: 'Stables',
    TAG_TEAMS: 'TagTeams',
    STABLE_INVITATIONS: 'StableInvitations',
  },
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
    queryStringParameters: { section: 'match-types' },
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

// ─── Tests ───────────────────────────────────────────────────────────

describe('getStatistics - match-types section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns leaderboard for all matches when no filter applied', async () => {
    mockScanAll.mockImplementation(({ TableName }: { TableName: string }) => {
      if (TableName === 'Players') return Promise.resolve([player1, player2]);
      if (TableName === 'Matches') {
        return Promise.resolve([
          makeMatch({ matchFormat: 'Singles', winners: ['p1'], losers: ['p2'] }),
          makeMatch({ matchFormat: 'Singles', winners: ['p1'], losers: ['p2'] }),
          makeMatch({ matchFormat: 'Singles', winners: ['p2'], losers: ['p1'] }),
        ]);
      }
      if (TableName === 'MatchTypes') return Promise.resolve([]);
      if (TableName === 'Stipulations') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const event = makeEvent();
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(200);

    const body = JSON.parse(result!.body);
    expect(body.leaderboard).toBeDefined();
    expect(body.leaderboard.length).toBe(2);
    // p1: 2W-1L, p2: 1W-2L
    expect(body.leaderboard[0].playerId).toBe('p1');
    expect(body.leaderboard[0].wins).toBe(2);
    expect(body.leaderboard[0].losses).toBe(1);
    expect(body.leaderboard[0].rank).toBe(1);
    expect(body.leaderboard[1].playerId).toBe('p2');
    expect(body.leaderboard[1].rank).toBe(2);
  });

  it('only includes players with matches played', async () => {
    const player3 = makePlayer('p3', 'Player Three', 'Wrestler C');
    mockScanAll.mockImplementation(({ TableName }: { TableName: string }) => {
      if (TableName === 'Players') return Promise.resolve([player1, player2, player3]);
      if (TableName === 'Matches') {
        return Promise.resolve([
          makeMatch({ matchFormat: 'Singles', winners: ['p1'], losers: ['p2'] }),
        ]);
      }
      if (TableName === 'MatchTypes') return Promise.resolve([]);
      if (TableName === 'Stipulations') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const event = makeEvent();
    const result = await handler(event, ctx, cb);

    const body = JSON.parse(result!.body);
    // p3 has no matches, should be excluded
    expect(body.leaderboard.length).toBe(2);
    expect(body.leaderboard.find((e: Record<string, unknown>) => e.playerId === 'p3')).toBeUndefined();
  });

  it('filters by seasonId when provided', async () => {
    mockScanAll.mockImplementation(({ TableName }: { TableName: string }) => {
      if (TableName === 'Players') return Promise.resolve([player1, player2]);
      if (TableName === 'Matches') {
        return Promise.resolve([
          makeMatch({ matchFormat: 'Singles', seasonId: 's1', winners: ['p1'], losers: ['p2'] }),
          makeMatch({ matchFormat: 'Singles', seasonId: 's2', winners: ['p2'], losers: ['p1'] }),
        ]);
      }
      if (TableName === 'MatchTypes') return Promise.resolve([]);
      if (TableName === 'Stipulations') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const event = makeEvent({
      queryStringParameters: { section: 'match-types', seasonId: 's1' },
    });
    const result = await handler(event, ctx, cb);

    const body = JSON.parse(result!.body);
    // Only s1 match: p1 wins
    expect(body.leaderboard[0].playerId).toBe('p1');
    expect(body.leaderboard[0].wins).toBe(1);
    expect(body.leaderboard[0].losses).toBe(0);
  });

  it('returns 500 on error', async () => {
    mockScanAll.mockRejectedValue(new Error('DynamoDB error'));

    const event = makeEvent();
    const result = await handler(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
  });
});
