import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const {
  mockGet,
  mockPut,
  mockQuery,
  mockUpdate,
  mockDelete,
  mockCreateNotifications,
  mockScheduleMatchInternal,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockCreateNotifications: vi.fn(),
  mockScheduleMatchInternal: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: mockPut,
    query: mockQuery,
    scan: vi.fn(),
    update: mockUpdate,
    delete: mockDelete,
    scanAll: vi.fn(),
    queryAll: vi.fn(),
  },
  TableNames: {
    PLAYERS: 'Players',
    MATCH_INVITATIONS: 'MatchInvitations',
    MATCHMAKING_QUEUE: 'MatchmakingQueue',
  },
}));

vi.mock('../../../lib/notifications', () => ({
  createNotification: vi.fn(),
  createNotifications: mockCreateNotifications,
}));

vi.mock('../../matches/scheduleMatch', () => {
  class FakeScheduleMatchError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.name = 'ScheduleMatchError';
      this.statusCode = statusCode;
    }
  }
  return {
    scheduleMatchInternal: mockScheduleMatchInternal,
    ScheduleMatchError: FakeScheduleMatchError,
  };
});

import { handler as acceptInvitation } from '../acceptInvitation';

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

function wrestlerEvent(invitationId: string, sub: string): APIGatewayProxyEvent {
  const base = makeEvent({ pathParameters: { invitationId } });
  return {
    ...base,
    requestContext: {
      ...base.requestContext,
      authorizer: {
        groups: 'Wrestler',
        username: 'caller',
        email: 'c@test.com',
        principalId: sub,
      },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const futureIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();
const pastIso = new Date(Date.now() - 60 * 1000).toISOString();

// ─── Tests ───────────────────────────────────────────────────────────

describe('matchmaking/acceptInvitation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a pending unexpired invitation, schedules a match, and notifies both players', async () => {
    // caller player lookup
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p2', userId: 'user-sub-2', name: 'Recipient' }],
    });
    // load invitation
    mockGet.mockResolvedValueOnce({
      Item: {
        invitationId: 'inv-1',
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        status: 'pending',
        createdAt: pastIso,
        expiresAt: futureIso,
      },
    });
    mockUpdate.mockResolvedValueOnce({
      Attributes: {
        invitationId: 'inv-1',
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        status: 'accepted',
        createdAt: pastIso,
        expiresAt: futureIso,
        acceptedAt: 'now',
        updatedAt: 'now',
      },
    });
    mockScheduleMatchInternal.mockResolvedValue({ matchId: 'match-xyz' });
    // fromPlayer then toPlayer
    mockGet.mockResolvedValueOnce({
      Item: { playerId: 'p1', userId: 'user-sub-1', name: 'Inviter' },
    });
    mockGet.mockResolvedValueOnce({
      Item: { playerId: 'p2', userId: 'user-sub-2', name: 'Recipient' },
    });
    mockDelete.mockResolvedValue({});
    mockCreateNotifications.mockResolvedValue(undefined);

    const result = await acceptInvitation(wrestlerEvent('inv-1', 'user-sub-2'));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.matchId).toBe('match-xyz');
    expect(body.invitation.status).toBe('accepted');
    expect(mockScheduleMatchInternal).toHaveBeenCalledOnce();
    expect(mockCreateNotifications).toHaveBeenCalledOnce();
    const notifs = mockCreateNotifications.mock.calls[0][0];
    expect(notifs).toHaveLength(2);
  });

  it('returns 403 when a non-recipient tries to accept', async () => {
    // caller is the inviter (p1), not the toPlayer (p2)
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p1', userId: 'user-sub-1', name: 'Inviter' }],
    });
    mockGet.mockResolvedValueOnce({
      Item: {
        invitationId: 'inv-1',
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        status: 'pending',
        createdAt: pastIso,
        expiresAt: futureIso,
      },
    });

    const result = await acceptInvitation(wrestlerEvent('inv-1', 'user-sub-1'));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('Only the recipient can accept');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockScheduleMatchInternal).not.toHaveBeenCalled();
  });

  it('returns 400 for an expired invitation', async () => {
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p2', userId: 'user-sub-2', name: 'Recipient' }],
    });
    mockGet.mockResolvedValueOnce({
      Item: {
        invitationId: 'inv-1',
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        status: 'pending',
        createdAt: pastIso,
        expiresAt: pastIso,
      },
    });

    const result = await acceptInvitation(wrestlerEvent('inv-1', 'user-sub-2'));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invitation expired');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when the invitation has already been actioned (ConditionalCheckFailedException)', async () => {
    mockQuery.mockResolvedValueOnce({
      Items: [{ playerId: 'p2', userId: 'user-sub-2', name: 'Recipient' }],
    });
    // invitation still appears pending at read time, but conditional update fails
    mockGet.mockResolvedValueOnce({
      Item: {
        invitationId: 'inv-1',
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        status: 'pending',
        createdAt: pastIso,
        expiresAt: futureIso,
      },
    });
    const condErr = new Error('condition failed');
    condErr.name = 'ConditionalCheckFailedException';
    mockUpdate.mockRejectedValueOnce(condErr);

    const result = await acceptInvitation(wrestlerEvent('inv-1', 'user-sub-2'));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invitation already actioned');
    expect(mockScheduleMatchInternal).not.toHaveBeenCalled();
  });
});
