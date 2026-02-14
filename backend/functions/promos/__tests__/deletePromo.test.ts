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
  TableNames: { PROMOS: 'Promos' },
}));

import { handler as deletePromo } from '../deletePromo';

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

describe('deletePromo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when promoId is missing', async () => {
    const event = withAuth(makeEvent({ pathParameters: null }), 'Admin');
    const result = await deletePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('promoId is required');
  });

  it('returns 404 when promo does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const event = withAuth(makeEvent({ pathParameters: { promoId: 'pr1' } }), 'Admin');
    const result = await deletePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Promo not found');
  });

  it('returns 403 when user is not Admin or Moderator', async () => {
    const event = withAuth(makeEvent({ pathParameters: { promoId: 'pr1' } }), 'Wrestler');
    const result = await deletePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('deletes promo and returns 204 when Admin', async () => {
    mockGet.mockResolvedValue({ Item: { promoId: 'pr1' } });
    mockDelete.mockResolvedValue({});
    const event = withAuth(makeEvent({ pathParameters: { promoId: 'pr1' } }), 'Admin');
    const result = await deletePromo(event, ctx, cb);
    expect(result!.statusCode).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({
      TableName: 'Promos',
      Key: { promoId: 'pr1' },
    });
  });
});
