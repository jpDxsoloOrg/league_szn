import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockPut, mockQuery, mockCreateNotification } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockQuery: vi.fn(),
  mockCreateNotification: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    query: mockQuery,
    scan: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scanAll: vi.fn(),
    queryAll: vi.fn(),
  },
  TableNames: {
    PLAYERS: 'Players',
    PRESENCE: 'Presence',
    MATCH_INVITATIONS: 'MatchInvitations',
  },
}));

vi.mock('../../../lib/notifications', () => ({
  createNotification: mockCreateNotification,
  createNotifications: vi.fn(),
}));

import { handler as createInvitation } from '../createInvitation';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function wrestlerEvent(body: object | null): APIGatewayProxyEvent {
  const base = makeEvent({ body: body ? JSON.stringify(body) : null });
  return {
    ...base,
    requestContext: {
      ...base.requestContext,
      authorizer: {
        groups: 'Wrestler',
        username: 'caller',
        email: 'c@test.com',
        principalId: 'user-sub-1',
      },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const futureTtl = Math.floor(Date.now() / 1000) + 300;

// Common "caller lookup" mock shorthand
function mockCallerPlayer() {
  mockQuery.mockResolvedValueOnce({
    Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Caller' }],
  });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('matchmaking/createInvitation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an invitation and notifies target when both are online', async () => {
    mockCallerPlayer();
    // caller presence
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl, lastSeenAt: 'x' } });
    // target player record
    mockGet.mockResolvedValueOnce({
      Item: { playerId: 'p2', userId: 'user-sub-2', name: 'Target' },
    });
    // target presence
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p2', ttl: futureTtl, lastSeenAt: 'x' } });
    // existing pending query (by target)
    mockQuery.mockResolvedValueOnce({ Items: [] });
    mockPut.mockResolvedValue({});
    mockCreateNotification.mockResolvedValue(undefined);

    const result = await createInvitation(
      wrestlerEvent({ targetPlayerId: 'p2' }),
      {} as never,
      () => undefined
    );

    expect(result).toBeDefined();
    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.fromPlayerId).toBe('p1');
    expect(body.toPlayerId).toBe('p2');
    expect(body.status).toBe('pending');

    expect(mockPut).toHaveBeenCalledOnce();
    expect(mockPut.mock.calls[0][0].TableName).toBe('MatchInvitations');
    expect(mockCreateNotification).toHaveBeenCalledOnce();
  });

  it('returns 400 when caller has no presence row', async () => {
    mockCallerPlayer();
    mockGet.mockResolvedValueOnce({ Item: undefined });

    const result = await createInvitation(
      wrestlerEvent({ targetPlayerId: 'p2' }),
      {} as never,
      () => undefined
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('You must appear online before inviting');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('returns 400 when target is offline (no presence row)', async () => {
    mockCallerPlayer();
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl, lastSeenAt: 'x' } });
    mockGet.mockResolvedValueOnce({
      Item: { playerId: 'p2', userId: 'user-sub-2', name: 'Target' },
    });
    mockGet.mockResolvedValueOnce({ Item: undefined });

    const result = await createInvitation(
      wrestlerEvent({ targetPlayerId: 'p2' }),
      {} as never,
      () => undefined
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Target player is not online');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('returns 400 when caller invites themself', async () => {
    mockCallerPlayer();

    const result = await createInvitation(
      wrestlerEvent({ targetPlayerId: 'p1' }),
      {} as never,
      () => undefined
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Cannot invite yourself');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('rejects championship invitations with 400', async () => {
    mockCallerPlayer();

    const result = await createInvitation(
      wrestlerEvent({ targetPlayerId: 'p2', championshipId: 'c1' }),
      {} as never,
      () => undefined
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe(
      'Championship matches cannot be scheduled via matchmaking. Use the challenge or admin scheduling flow.'
    );
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('returns 400 when a pending invitation already exists', async () => {
    const futureIso = new Date(Date.now() + 60_000).toISOString();
    mockCallerPlayer();
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p1', ttl: futureTtl, lastSeenAt: 'x' } });
    mockGet.mockResolvedValueOnce({
      Item: { playerId: 'p2', userId: 'user-sub-2', name: 'Target' },
    });
    mockGet.mockResolvedValueOnce({ Item: { playerId: 'p2', ttl: futureTtl, lastSeenAt: 'x' } });
    mockQuery.mockResolvedValueOnce({
      Items: [
        {
          invitationId: 'inv-old',
          fromPlayerId: 'p1',
          toPlayerId: 'p2',
          status: 'pending',
          expiresAt: futureIso,
        },
      ],
    });

    const result = await createInvitation(
      wrestlerEvent({ targetPlayerId: 'p2' }),
      {} as never,
      () => undefined
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invitation already pending');
    expect(mockPut).not.toHaveBeenCalled();
  });
});
