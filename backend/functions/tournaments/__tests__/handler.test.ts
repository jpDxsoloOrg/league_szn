import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockGetTournaments = vi.fn();
const mockCreateTournament = vi.fn();
const mockUpdateTournament = vi.fn();

vi.mock('../getTournaments', () => ({ handler: (...args: unknown[]) => mockGetTournaments(...args) }));
vi.mock('../createTournament', () => ({ handler: (...args: unknown[]) => mockCreateTournament(...args) }));
vi.mock('../updateTournament', () => ({ handler: (...args: unknown[]) => mockUpdateTournament(...args) }));

import { handler } from '../handler';

const ctx = {} as Context;
const noopCb = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/tournaments',
    pathParameters: null,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

describe('tournaments router handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTournaments.mockResolvedValue({ statusCode: 200, body: '[]' });
    mockCreateTournament.mockResolvedValue({ statusCode: 201, body: '{}' });
    mockUpdateTournament.mockResolvedValue({ statusCode: 200, body: '{}' });
  });

  it('GET without tournamentId calls getTournaments', async () => {
    const event = makeEvent({ httpMethod: 'GET', pathParameters: null });
    await handler(event, ctx, noopCb);
    expect(mockGetTournaments).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockCreateTournament).not.toHaveBeenCalled();
    expect(mockUpdateTournament).not.toHaveBeenCalled();
  });

  it('POST without tournamentId calls createTournament', async () => {
    const event = makeEvent({ httpMethod: 'POST', pathParameters: null });
    await handler(event, ctx, noopCb);
    expect(mockCreateTournament).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockGetTournaments).not.toHaveBeenCalled();
    expect(mockUpdateTournament).not.toHaveBeenCalled();
  });

  it('PUT with tournamentId calls updateTournament', async () => {
    const event = makeEvent({
      httpMethod: 'PUT',
      pathParameters: { tournamentId: 't1' },
    });
    await handler(event, ctx, noopCb);
    expect(mockUpdateTournament).toHaveBeenCalledWith(event, ctx, noopCb);
    expect(mockGetTournaments).not.toHaveBeenCalled();
    expect(mockCreateTournament).not.toHaveBeenCalled();
  });

  it('DELETE returns 405 Method Not Allowed', async () => {
    const event = makeEvent({ httpMethod: 'DELETE' });
    const result = await handler(event, ctx, noopCb);
    expect(result).toBeDefined();
    expect(result!.statusCode).toBe(405);
    expect(mockGetTournaments).not.toHaveBeenCalled();
    expect(mockCreateTournament).not.toHaveBeenCalled();
    expect(mockUpdateTournament).not.toHaveBeenCalled();
  });
});
