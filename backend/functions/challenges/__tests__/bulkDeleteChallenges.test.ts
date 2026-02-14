import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockQueryAll, mockDelete } = vi.hoisted(() => ({
  mockQueryAll: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    queryAll: mockQueryAll,
    delete: mockDelete,
  },
  TableNames: { CHALLENGES: 'Challenges' },
}));

import { handler as bulkDeleteChallenges } from '../bulkDeleteChallenges';

const ctx = {} as Context;
const cb: Callback = () => {};

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

describe('bulkDeleteChallenges', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when statuses is missing or empty', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({}) }), 'Admin');
    const result = await bulkDeleteChallenges(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
  });

  it('returns 403 when user is not Admin', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ statuses: ['cancelled'] }) }),
      'Wrestler'
    );
    const result = await bulkDeleteChallenges(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('deletes challenges and returns count when Admin', async () => {
    mockQueryAll
      .mockResolvedValueOnce([
        { challengeId: 'ch1', status: 'cancelled' },
        { challengeId: 'ch2', status: 'cancelled' },
      ])
      .mockResolvedValueOnce([]);
    mockDelete.mockResolvedValue({});
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ statuses: ['cancelled', 'expired'] }) }),
      'Admin'
    );
    const result = await bulkDeleteChallenges(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.deleted).toBe(2);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });
});
