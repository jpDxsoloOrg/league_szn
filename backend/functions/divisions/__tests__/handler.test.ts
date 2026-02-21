import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockGetDivisions = vi.fn();
const mockCreateDivision = vi.fn();
const mockUpdateDivision = vi.fn();
const mockDeleteDivision = vi.fn();

vi.mock('../getDivisions', () => ({ handler: (...args: unknown[]) => mockGetDivisions(...args) }));
vi.mock('../createDivision', () => ({ handler: (...args: unknown[]) => mockCreateDivision(...args) }));
vi.mock('../updateDivision', () => ({ handler: (...args: unknown[]) => mockUpdateDivision(...args) }));
vi.mock('../deleteDivision', () => ({ handler: (...args: unknown[]) => mockDeleteDivision(...args) }));

import { handler } from '../handler';

const ctx = {} as Context;
const noopCb = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/divisions',
    pathParameters: null,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/divisions',
    ...overrides,
  };
}

describe('divisions router handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDivisions.mockResolvedValue({ statusCode: 200, body: '[]' });
    mockCreateDivision.mockResolvedValue({ statusCode: 201, body: '{}' });
    mockUpdateDivision.mockResolvedValue({ statusCode: 200, body: '{}' });
    mockDeleteDivision.mockResolvedValue({ statusCode: 204, body: '' });
  });

  it('GET without divisionId calls getDivisions', async () => {
    const event = makeEvent({ httpMethod: 'GET', resource: '/divisions' });
    const result = await handler(event, ctx, noopCb);
    expect(mockGetDivisions).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockCreateDivision).not.toHaveBeenCalled();
    expect(mockUpdateDivision).not.toHaveBeenCalled();
    expect(mockDeleteDivision).not.toHaveBeenCalled();
    expect(result!.statusCode).toBe(200);
  });

  it('POST without divisionId calls createDivision', async () => {
    const event = makeEvent({ httpMethod: 'POST', resource: '/divisions' });
    const result = await handler(event, ctx, noopCb);
    expect(mockCreateDivision).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockGetDivisions).not.toHaveBeenCalled();
    expect(mockUpdateDivision).not.toHaveBeenCalled();
    expect(mockDeleteDivision).not.toHaveBeenCalled();
    expect(result!.statusCode).toBe(201);
  });

  it('PUT with divisionId calls updateDivision', async () => {
    const event = makeEvent({
      httpMethod: 'PUT',
      resource: '/divisions/{divisionId}',
      pathParameters: { divisionId: 'div-1' },
    });
    const result = await handler(event, ctx, noopCb);
    expect(mockUpdateDivision).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockGetDivisions).not.toHaveBeenCalled();
    expect(mockCreateDivision).not.toHaveBeenCalled();
    expect(mockDeleteDivision).not.toHaveBeenCalled();
    expect(result!.statusCode).toBe(200);
  });

  it('DELETE with divisionId calls deleteDivision', async () => {
    const event = makeEvent({
      httpMethod: 'DELETE',
      resource: '/divisions/{divisionId}',
      pathParameters: { divisionId: 'div-1' },
    });
    const result = await handler(event, ctx, noopCb);
    expect(mockDeleteDivision).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockGetDivisions).not.toHaveBeenCalled();
    expect(mockCreateDivision).not.toHaveBeenCalled();
    expect(mockUpdateDivision).not.toHaveBeenCalled();
    expect(result!.statusCode).toBe(204);
  });

  it('PATCH returns 405 Method Not Allowed', async () => {
    const event = makeEvent({ httpMethod: 'PATCH' });
    const result = await handler(event, ctx, noopCb);
    expect(result).toBeDefined();
    expect(result!.statusCode).toBe(405);
    expect(mockGetDivisions).not.toHaveBeenCalled();
    expect(mockCreateDivision).not.toHaveBeenCalled();
    expect(mockUpdateDivision).not.toHaveBeenCalled();
    expect(mockDeleteDivision).not.toHaveBeenCalled();
  });
});
