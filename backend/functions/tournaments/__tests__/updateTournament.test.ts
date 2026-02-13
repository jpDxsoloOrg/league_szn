import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// --- Mocks ---

const { mockGet, mockUpdate } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    update: mockUpdate,
  },
  TableNames: {
    TOURNAMENTS: 'Tournaments',
  },
}));

import { handler as updateTournament } from '../updateTournament';

// --- Helpers ---

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'PUT',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

// --- updateTournament ---

describe('updateTournament', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates tournament status and returns updated item', async () => {
    mockGet.mockResolvedValue({ Item: { tournamentId: 't1', name: 'Test', status: 'upcoming' } });
    mockUpdate.mockResolvedValue({
      Attributes: { tournamentId: 't1', name: 'Test', status: 'in-progress' },
    });

    const event = makeEvent({
      pathParameters: { tournamentId: 't1' },
      body: JSON.stringify({ status: 'in-progress' }),
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).status).toBe('in-progress');
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('updates tournament winner', async () => {
    mockGet.mockResolvedValue({ Item: { tournamentId: 't1' } });
    mockUpdate.mockResolvedValue({ Attributes: { tournamentId: 't1', winner: 'p1' } });

    const event = makeEvent({
      pathParameters: { tournamentId: 't1' },
      body: JSON.stringify({ winner: 'p1' }),
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).winner).toBe('p1');
  });

  it('updates tournament brackets', async () => {
    const newBrackets = { rounds: [{ roundNumber: 1, matches: [{ winner: 'p1' }] }] };
    mockGet.mockResolvedValue({ Item: { tournamentId: 't1' } });
    mockUpdate.mockResolvedValue({ Attributes: { tournamentId: 't1', brackets: newBrackets } });

    const event = makeEvent({
      pathParameters: { tournamentId: 't1' },
      body: JSON.stringify({ brackets: newBrackets }),
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).brackets).toEqual(newBrackets);
  });

  it('updates tournament standings', async () => {
    const newStandings = { p1: { wins: 2, losses: 0, draws: 0, points: 6 } };
    mockGet.mockResolvedValue({ Item: { tournamentId: 't1' } });
    mockUpdate.mockResolvedValue({ Attributes: { tournamentId: 't1', standings: newStandings } });

    const event = makeEvent({
      pathParameters: { tournamentId: 't1' },
      body: JSON.stringify({ standings: newStandings }),
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).standings).toEqual(newStandings);
  });

  it('updates multiple fields at once', async () => {
    mockGet.mockResolvedValue({ Item: { tournamentId: 't1' } });
    mockUpdate.mockResolvedValue({
      Attributes: { tournamentId: 't1', status: 'completed', winner: 'p1' },
    });

    const event = makeEvent({
      pathParameters: { tournamentId: 't1' },
      body: JSON.stringify({ status: 'completed', winner: 'p1' }),
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.UpdateExpression).toContain('#status = :status');
    expect(updateCall.UpdateExpression).toContain('#winner = :winner');
  });

  it('returns 404 if tournament does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const event = makeEvent({
      pathParameters: { tournamentId: 'missing' },
      body: JSON.stringify({ status: 'in-progress' }),
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Tournament not found');
  });

  it('returns 400 when no valid fields to update', async () => {
    mockGet.mockResolvedValue({ Item: { tournamentId: 't1' } });

    const event = makeEvent({
      pathParameters: { tournamentId: 't1' },
      body: JSON.stringify({ unknownField: 'value' }),
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('No valid fields to update');
  });

  it('returns 400 when tournamentId is missing from path', async () => {
    const event = makeEvent({
      pathParameters: null,
      body: JSON.stringify({ status: 'in-progress' }),
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Tournament ID is required');
  });

  it('returns 400 for null body', async () => {
    const event = makeEvent({
      pathParameters: { tournamentId: 't1' },
      body: null,
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 for malformed JSON body', async () => {
    const event = makeEvent({
      pathParameters: { tournamentId: 't1' },
      body: 'not json',
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 500 when update throws', async () => {
    mockGet.mockResolvedValue({ Item: { tournamentId: 't1' } });
    mockUpdate.mockRejectedValue(new Error('DynamoDB failure'));

    const event = makeEvent({
      pathParameters: { tournamentId: 't1' },
      body: JSON.stringify({ status: 'in-progress' }),
    });

    const result = await updateTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to update tournament');
  });
});
