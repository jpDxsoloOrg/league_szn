import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockQuery } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: vi.fn(), scan: vi.fn(), query: mockQuery,
    update: vi.fn(), delete: vi.fn(), scanAll: vi.fn(), queryAll: vi.fn(),
  },
  TableNames: {
    EVENTS: 'Events', MATCHES: 'Matches',
    PLAYERS: 'Players', CHAMPIONSHIPS: 'Championships',
  },
}));

import { handler as getEvent } from '../getEvent';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as any, ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('getEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when eventId path parameter is missing', async () => {
    const result = await getEvent(makeEvent({ pathParameters: null }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Event ID is required');
  });

  it('returns 404 when event does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const event = makeEvent({ pathParameters: { eventId: 'nonexistent' } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Event not found');
  });

  it('returns event with empty enrichedMatches when no matchCards', async () => {
    mockGet.mockResolvedValue({
      Item: { eventId: 'e1', name: 'WrestleMania', matchCards: [] },
    });
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.eventId).toBe('e1');
    expect(body.enrichedMatches).toEqual([]);
  });

  it('returns enriched match data with player names and championship info', async () => {
    mockGet
      .mockResolvedValueOnce({
        Item: {
          eventId: 'e1', name: 'WrestleMania',
          matchCards: [{ position: 1, matchId: 'm1', designation: 'Main Event', notes: 'Title match' }],
        },
      })
      .mockResolvedValueOnce({
        Item: { playerId: 'p1', name: 'John Cena', currentWrestler: 'John Cena' },
      })
      .mockResolvedValueOnce({
        Item: { championshipId: 'c1', name: 'World Championship' },
      });
    mockQuery.mockResolvedValueOnce({
      Items: [{
        matchId: 'm1', matchType: 'singles', stipulation: 'No DQ',
        participants: ['p1'], winners: ['p1'], losers: [],
        isChampionship: true, championshipId: 'c1', status: 'completed',
      }],
    });

    const event = makeEvent({ pathParameters: { eventId: 'e1' } });
    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.enrichedMatches).toHaveLength(1);
    const match = body.enrichedMatches[0];
    expect(match.position).toBe(1);
    expect(match.designation).toBe('Main Event');
    expect(match.notes).toBe('Title match');
    expect(match.matchData.matchType).toBe('singles');
    expect(match.matchData.participants).toHaveLength(1);
    expect(match.matchData.participants[0].playerName).toBe('John Cena');
    expect(match.matchData.participants[0].wrestlerName).toBe('John Cena');
    expect(match.matchData.isChampionship).toBe(true);
    expect(match.matchData.championshipName).toBe('World Championship');
  });

  it('returns matchData null when matchId is missing from card', async () => {
    mockGet.mockResolvedValueOnce({
      Item: {
        eventId: 'e1', name: 'Raw',
        matchCards: [{ position: 1, matchId: undefined, designation: 'TBD' }],
      },
    });
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).enrichedMatches[0].matchData).toBeNull();
  });

  it('returns matchData null when match is not found in database', async () => {
    mockGet.mockResolvedValueOnce({
      Item: {
        eventId: 'e1', name: 'Raw',
        matchCards: [{ position: 1, matchId: 'm-gone', designation: 'Opener' }],
      },
    });
    mockQuery.mockResolvedValueOnce({ Items: [] });
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.enrichedMatches[0].matchData).toBeNull();
    expect(body.enrichedMatches[0].matchId).toBe('m-gone');
  });

  it('uses Unknown Player/Wrestler when player not found', async () => {
    mockGet
      .mockResolvedValueOnce({
        Item: {
          eventId: 'e1',
          matchCards: [{ position: 1, matchId: 'm1', designation: 'Match' }],
        },
      })
      .mockResolvedValueOnce({ Item: undefined });
    mockQuery.mockResolvedValueOnce({
      Items: [{
        matchId: 'm1', matchType: 'singles',
        participants: ['p-missing'], isChampionship: false, status: 'scheduled',
      }],
    });
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const participant = JSON.parse(result!.body).enrichedMatches[0].matchData.participants[0];
    expect(participant.playerName).toBe('Unknown Player');
    expect(participant.wrestlerName).toBe('Unknown Wrestler');
  });

  it('omits championshipName when match is not a championship match', async () => {
    mockGet.mockResolvedValueOnce({
      Item: {
        eventId: 'e1',
        matchCards: [{ position: 1, matchId: 'm1', designation: 'Match' }],
      },
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{
        matchId: 'm1', matchType: 'tag',
        participants: [], isChampionship: false, status: 'scheduled',
      }],
    });
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const matchData = JSON.parse(result!.body).enrichedMatches[0].matchData;
    expect(matchData.isChampionship).toBe(false);
    expect(matchData.championshipName).toBeUndefined();
  });

  it('handles event with undefined matchCards property', async () => {
    mockGet.mockResolvedValue({
      Item: { eventId: 'e1', name: 'Raw' },
    });
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.enrichedMatches).toEqual([]);
  });

  it('returns 500 when DynamoDB fails', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB error'));
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch event');
  });
});
