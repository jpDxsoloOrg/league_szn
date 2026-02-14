import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockScanAll, mockDelete } = vi.hoisted(() => ({
  mockScanAll: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    scanAll: mockScanAll,
    delete: mockDelete,
  },
  TableNames: { PROMOS: 'Promos' },
}));

import { handler as bulkDeletePromos } from '../bulkDeletePromos';

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

describe('bulkDeletePromos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when isHidden is not boolean', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({}) }), 'Admin');
    const result = await bulkDeletePromos(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
  });

  it('returns 403 when user is not Admin or Moderator', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ isHidden: true }) }),
      'Wrestler'
    );
    const result = await bulkDeletePromos(event, ctx, cb);
    expect(result!.statusCode).toBe(403);
  });

  it('deletes hidden promos and returns count when Admin', async () => {
    mockScanAll.mockResolvedValue([
      { promoId: 'pr1', isHidden: true },
      { promoId: 'pr2', isHidden: true },
    ]);
    mockDelete.mockResolvedValue({});
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ isHidden: true }) }),
      'Admin'
    );
    const result = await bulkDeletePromos(event, ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.deleted).toBe(2);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });
});
