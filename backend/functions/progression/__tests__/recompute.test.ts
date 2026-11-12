import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from 'aws-lambda';

const { mockRecompute } = vi.hoisted(() => ({ mockRecompute: vi.fn() }));

vi.mock('../../../lib/progression/recompute', () => ({ recomputeProgression: mockRecompute }));
vi.mock('../../../lib/authenticate', () => ({ authenticate: async () => ({ ok: true }) }));

import { handler } from '../handler';
import { handleDirectInvoke } from '../routes/recompute';

const ctx = {} as Context;
const cb: Callback = () => {};

const EMPTY_RESULT = { playersProcessed: 0, changes: [], dropped: [], failures: [] };

function apiEvent(groups: string, body: unknown): APIGatewayProxyEvent {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/admin/progression/recompute',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/admin/progression/recompute',
    requestContext: { authorizer: { groups, username: 'mod', email: 'm@x' } } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const call = async (event: unknown): Promise<APIGatewayProxyResult> =>
  (await handler(event as APIGatewayProxyEvent, ctx, cb)) as APIGatewayProxyResult;

describe('progression Lambda: direct invoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecompute.mockResolvedValue(EMPTY_RESULT);
  });

  it('recomputes the players in an async trigger payload', async () => {
    const result = await call({ playerIds: ['p1', 'p2'], source: 'recordResult' });

    expect(result.statusCode).toBe(200);
    expect(mockRecompute).toHaveBeenCalledWith({ playerIds: ['p1', 'p2'] });
  });

  it('recomputes everyone for { all: true }', async () => {
    await handleDirectInvoke({ all: true });
    expect(mockRecompute).toHaveBeenCalledWith({ all: true });
  });

  it('ignores a payload without players and drops non-string ids', async () => {
    await handleDirectInvoke({});
    await handleDirectInvoke({ playerIds: [] });
    expect(mockRecompute).not.toHaveBeenCalled();

    await handleDirectInvoke({ playerIds: ['p1', 7, ''] as unknown as string[] });
    expect(mockRecompute).toHaveBeenCalledWith({ playerIds: ['p1'] });
  });

  it('swallows recompute errors so Lambda does not retry the event', async () => {
    mockRecompute.mockRejectedValue(new Error('boom'));
    await expect(handleDirectInvoke({ playerIds: ['p1'] })).resolves.toBeUndefined();
  });
});

describe('POST /admin/progression/recompute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecompute.mockResolvedValue({
      playersProcessed: 2,
      changes: [{ playerId: 'p1', trackId: 't1', after: {} }],
      dropped: [{ playerId: 'p2', trackId: 't0', reason: 'divisionChanged', row: {} }],
      failures: [],
    });
  });

  it('runs recompute-all for a Moderator with no body', async () => {
    const result = await call(apiEvent('Moderator', undefined));

    expect(result.statusCode).toBe(200);
    expect(mockRecompute).toHaveBeenCalledWith({ all: true });
    expect(JSON.parse(result.body)).toEqual({ playersProcessed: 2, rowsUpdated: 1, rowsDropped: 1, failures: [] });
  });

  it('recomputes only the given players', async () => {
    const result = await call(apiEvent('Admin', { playerIds: ['p1'] }));

    expect(result.statusCode).toBe(200);
    expect(mockRecompute).toHaveBeenCalledWith({ playerIds: ['p1'] });
  });

  it.each([[{ playerIds: 'p1' }], [{ playerIds: [] }], [{ playerIds: [1] }]])('rejects %j', async (body) => {
    const result = await call(apiEvent('Admin', body));

    expect(result.statusCode).toBe(400);
    expect(mockRecompute).not.toHaveBeenCalled();
  });

  it('is forbidden to wrestlers', async () => {
    const result = await call(apiEvent('Wrestler', undefined));

    expect(result.statusCode).toBe(403);
    expect(mockRecompute).not.toHaveBeenCalled();
  });

  it('returns 500 when the recompute throws', async () => {
    mockRecompute.mockRejectedValue(new Error('boom'));
    const result = await call(apiEvent('Admin', undefined));
    expect(result.statusCode).toBe(500);
  });
});
