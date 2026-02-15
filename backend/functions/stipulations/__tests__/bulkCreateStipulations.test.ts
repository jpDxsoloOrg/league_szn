import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockPut } = vi.hoisted(() => ({
  mockPut: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: { put: mockPut },
  TableNames: { STIPULATIONS: 'Stipulations' },
}));

import { handler as bulkCreateStipulations } from '../bulkCreateStipulations';

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

describe('bulkCreateStipulations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when names is missing', async () => {
    const event = makeEvent({ body: JSON.stringify({}) });
    const result = await bulkCreateStipulations(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 when names is empty array', async () => {
    const event = makeEvent({ body: JSON.stringify({ names: [] }) });
    const result = await bulkCreateStipulations(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 when names exceeds limit', async () => {
    const names = Array.from({ length: 51 }, (_, i) => `Stipulation ${i}`);
    const event = makeEvent({ body: JSON.stringify({ names }) });
    const result = await bulkCreateStipulations(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('50');
  });

  it('returns 400 when all names are empty strings', async () => {
    const event = makeEvent({ body: JSON.stringify({ names: ['', '  '] }) });
    const result = await bulkCreateStipulations(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
  });

  it('creates stipulations and returns 201', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({ body: JSON.stringify({ names: ['No DQ', 'Steel Cage', 'Ladder Match'] }) });
    const result = await bulkCreateStipulations(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.created).toBe(3);
    expect(body.stipulations).toHaveLength(3);
    expect(body.stipulations[0].name).toBe('No DQ');
    expect(body.stipulations[1].name).toBe('Steel Cage');
    expect(body.stipulations[2].name).toBe('Ladder Match');
    expect(mockPut).toHaveBeenCalledTimes(3);
  });

  it('deduplicates names', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({ body: JSON.stringify({ names: ['No DQ', 'No DQ', 'Steel Cage'] }) });
    const result = await bulkCreateStipulations(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.created).toBe(2);
    expect(mockPut).toHaveBeenCalledTimes(2);
  });

  it('trims whitespace from names', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({ body: JSON.stringify({ names: ['  No DQ  ', 'Steel Cage'] }) });
    const result = await bulkCreateStipulations(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.stipulations[0].name).toBe('No DQ');
  });

  it('returns 500 on DynamoDB failure', async () => {
    mockPut.mockRejectedValue(new Error('DynamoDB failure'));
    const event = makeEvent({ body: JSON.stringify({ names: ['No DQ'] }) });
    const result = await bulkCreateStipulations(event, ctx, cb);
    expect(result!.statusCode).toBe(500);
  });
});
