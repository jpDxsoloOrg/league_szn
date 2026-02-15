import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockPut } = vi.hoisted(() => ({
  mockPut: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: { put: mockPut },
  TableNames: { MATCH_TYPES: 'MatchTypes' },
}));

import { handler as bulkCreateMatchTypes } from '../bulkCreateMatchTypes';

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

describe('bulkCreateMatchTypes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when names is missing', async () => {
    const event = makeEvent({ body: JSON.stringify({}) });
    const result = await bulkCreateMatchTypes(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 when names is empty array', async () => {
    const event = makeEvent({ body: JSON.stringify({ names: [] }) });
    const result = await bulkCreateMatchTypes(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 when names exceeds limit', async () => {
    const names = Array.from({ length: 51 }, (_, i) => `Type ${i}`);
    const event = makeEvent({ body: JSON.stringify({ names }) });
    const result = await bulkCreateMatchTypes(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('50');
  });

  it('returns 400 when all names are empty strings', async () => {
    const event = makeEvent({ body: JSON.stringify({ names: ['', '  '] }) });
    const result = await bulkCreateMatchTypes(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
  });

  it('creates match types and returns 201', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({ body: JSON.stringify({ names: ['Singles', 'Tag Team', 'Triple Threat'] }) });
    const result = await bulkCreateMatchTypes(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.created).toBe(3);
    expect(body.matchTypes).toHaveLength(3);
    expect(body.matchTypes[0].name).toBe('Singles');
    expect(body.matchTypes[1].name).toBe('Tag Team');
    expect(body.matchTypes[2].name).toBe('Triple Threat');
    expect(mockPut).toHaveBeenCalledTimes(3);
  });

  it('deduplicates names', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({ body: JSON.stringify({ names: ['Singles', 'Singles', 'Tag Team'] }) });
    const result = await bulkCreateMatchTypes(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.created).toBe(2);
    expect(mockPut).toHaveBeenCalledTimes(2);
  });

  it('trims whitespace from names', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({ body: JSON.stringify({ names: ['  Singles  ', 'Tag Team'] }) });
    const result = await bulkCreateMatchTypes(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.matchTypes[0].name).toBe('Singles');
  });

  it('returns 500 on DynamoDB failure', async () => {
    mockPut.mockRejectedValue(new Error('DynamoDB failure'));
    const event = makeEvent({ body: JSON.stringify({ names: ['Singles'] }) });
    const result = await bulkCreateMatchTypes(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
  });
});
