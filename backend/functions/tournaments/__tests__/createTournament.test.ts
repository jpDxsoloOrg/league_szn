import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// --- Mocks ---

const { mockPut } = vi.hoisted(() => ({
  mockPut: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    put: mockPut,
  },
  TableNames: {
    TOURNAMENTS: 'Tournaments',
  },
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

import { handler as createTournament } from '../createTournament';

// --- Helpers ---

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
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

// --- createTournament ---

describe('createTournament', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a single-elimination tournament with bracket and returns 201', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({
        name: 'King of the Ring',
        type: 'single-elimination',
        participants: ['p1', 'p2', 'p3', 'p4'],
      }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.tournamentId).toBe('test-uuid-1234');
    expect(body.name).toBe('King of the Ring');
    expect(body.type).toBe('single-elimination');
    expect(body.status).toBe('upcoming');
    expect(body.participants).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(body.brackets).toBeDefined();
    expect(body.brackets.rounds).toBeInstanceOf(Array);
    expect(body.brackets.rounds.length).toBeGreaterThanOrEqual(2);
    expect(body.standings).toBeUndefined();
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('creates a round-robin tournament with standings and returns 201', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({
        name: 'Round Robin Classic',
        type: 'round-robin',
        participants: ['p1', 'p2', 'p3'],
      }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.type).toBe('round-robin');
    expect(body.standings).toBeDefined();
    expect(body.standings.p1).toEqual({ wins: 0, losses: 0, draws: 0, points: 0 });
    expect(body.standings.p2).toEqual({ wins: 0, losses: 0, draws: 0, points: 0 });
    expect(body.standings.p3).toEqual({ wins: 0, losses: 0, draws: 0, points: 0 });
    expect(body.brackets).toBeUndefined();
  });

  it('returns 400 when name is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ type: 'round-robin', participants: ['p1', 'p2'] }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe(
      'Name, type, and at least 2 participants are required',
    );
  });

  it('returns 400 when type is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'Test', participants: ['p1', 'p2'] }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe(
      'Name, type, and at least 2 participants are required',
    );
  });

  it('returns 400 when fewer than 2 participants', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'Test', type: 'round-robin', participants: ['p1'] }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe(
      'Name, type, and at least 2 participants are required',
    );
  });

  it('returns 400 when participants is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'Test', type: 'round-robin' }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });

  it('returns 400 for invalid tournament type', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'Test', type: 'battle-royal', participants: ['p1', 'p2'] }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe(
      'Type must be either "single-elimination" or "round-robin"',
    );
  });

  it('returns 400 for null body', async () => {
    const event = makeEvent({ body: null });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 for malformed JSON body', async () => {
    const event = makeEvent({ body: '{bad json' });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('generates bracket with byes for odd number of participants', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({
        name: 'Odd Tournament',
        type: 'single-elimination',
        participants: ['p1', 'p2', 'p3'],
      }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    // 3 participants: first round has 1 match (floor(3/2)), second round has 1 match
    expect(body.brackets.rounds[0].matches).toHaveLength(1);
    expect(body.brackets.rounds[0].matches[0].participant1).toBeDefined();
    expect(body.brackets.rounds[0].matches[0].participant2).toBeDefined();
  });

  it('generates correct bracket structure for power-of-2 participants', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({
        name: 'Perfect Bracket',
        type: 'single-elimination',
        participants: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    // 8 participants: 3 rounds (log2(8) = 3)
    expect(body.brackets.rounds).toHaveLength(3);
    // Round 1: 4 matches
    expect(body.brackets.rounds[0].matches).toHaveLength(4);
    // Round 2: 2 placeholder matches
    expect(body.brackets.rounds[1].matches).toHaveLength(2);
    // Round 3 (finals): 1 placeholder match
    expect(body.brackets.rounds[2].matches).toHaveLength(1);
  });

  it('returns 500 when put throws', async () => {
    mockPut.mockRejectedValue(new Error('DynamoDB failure'));
    const event = makeEvent({
      body: JSON.stringify({
        name: 'Test',
        type: 'round-robin',
        participants: ['p1', 'p2'],
      }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to create tournament');
  });

  it('creates tournament with exactly 2 participants (minimum)', async () => {
    mockPut.mockResolvedValue({});
    const event = makeEvent({
      body: JSON.stringify({
        name: 'Finals',
        type: 'single-elimination',
        participants: ['p1', 'p2'],
      }),
    });

    const result = await createTournament(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.brackets.rounds).toHaveLength(1);
    expect(body.brackets.rounds[0].matches).toHaveLength(1);
  });
});
