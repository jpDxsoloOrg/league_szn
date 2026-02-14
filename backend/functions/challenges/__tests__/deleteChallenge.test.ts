import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockGet, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    delete: mockDelete,
  },
  TableNames: { CHALLENGES: 'Challenges' },
}));

import { handler as deleteChallenge } from '../deleteChallenge';

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'DELETE',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: 'sub-1' },
    } as APIGatewayProxyEvent['requestContext'],
  };
}

describe('deleteChallenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when challengeId is missing', async () => {
    const event = withAuth(makeEvent({ pathParameters: null }), 'Admin');
    const result = await deleteChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('challengeId is required');
  });

  it('returns 404 when challenge does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const event = withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' } }), 'Admin');
    const result = await deleteChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Challenge not found');
  });

  it('returns 403 when user is not Admin', async () => {
    const event = withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' } }), 'Wrestler');
    const result = await deleteChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('deletes challenge and returns 204 when Admin', async () => {
    mockGet.mockResolvedValue({ Item: { challengeId: 'ch1', status: 'cancelled' } });
    mockDelete.mockResolvedValue({});
    const event = withAuth(makeEvent({ pathParameters: { challengeId: 'ch1' } }), 'Admin');
    const result = await deleteChallenge(event, ctx, cb);
    expect(result!.statusCode).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({
      TableName: 'Challenges',
      Key: { challengeId: 'ch1' },
    });
  });
});
