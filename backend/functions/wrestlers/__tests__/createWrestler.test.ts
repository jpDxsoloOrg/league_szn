import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as createWrestler } from '../createWrestler';

let repos: Repositories;
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
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('createWrestler', () => {
  it('creates a wrestler with required fields and returns 201', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        promotion: 'WWE',
        name: 'Cody Rhodes',
        overallCap: 90,
      }),
    });

    const result = await createWrestler(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.wrestlerId).toBe('test-uuid-1');
    expect(body.promotion).toBe('WWE');
    expect(body.name).toBe('Cody Rhodes');
    expect(body.overallCap).toBe(90);
    expect(body.isInUse).toBe(false);
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();

    const stored = await repos.roster.wrestlers.findById('test-uuid-1');
    expect(stored).not.toBeNull();
    expect(stored?.name).toBe('Cody Rhodes');
  });

  it('returns 400 when promotion is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'Cody', overallCap: 90 }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('promotion is required');
  });

  it('returns 400 when name is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ promotion: 'WWE', overallCap: 90 }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('name is required');
  });

  it('returns 400 when overallCap is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ promotion: 'WWE', name: 'Cody' }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('overallCap is required');
  });

  it('returns 400 when multiple required fields are missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ promotion: 'WWE' }) });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/name/);
    expect(JSON.parse(result!.body).message).toMatch(/overallCap/);
  });

  it('returns 400 when promotion is not in the WRESTLER_PROMOTIONS list', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        promotion: 'NOT_A_PROMOTION',
        name: 'Cody',
        overallCap: 90,
      }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/promotion must be one of/);
  });

  it('returns 400 when overallCap is below 70', async () => {
    const event = makeEvent({
      body: JSON.stringify({ promotion: 'WWE', name: 'Cody', overallCap: 69 }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(
      /overallCap must be an integer between 70 and 93/,
    );
  });

  it('returns 400 when overallCap is above 93', async () => {
    const event = makeEvent({
      body: JSON.stringify({ promotion: 'WWE', name: 'Cody', overallCap: 94 }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(
      /overallCap must be an integer between 70 and 93/,
    );
  });

  it('returns 400 when overallCap is not an integer', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        promotion: 'WWE',
        name: 'Cody',
        overallCap: 88.5,
      }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(
      /overallCap must be an integer between 70 and 93/,
    );
  });

  it('returns 400 when name is an empty/whitespace string', async () => {
    // `requiredFields` catches '' via falsy; whitespace-only falls through to validate.
    const event = makeEvent({
      body: JSON.stringify({
        promotion: 'WWE',
        name: '   ',
        overallCap: 90,
      }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/name/);
  });

  it('returns 400 when name exceeds 128 characters', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        promotion: 'WWE',
        name: 'A'.repeat(129),
        overallCap: 90,
      }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(
      /name must be a non-empty string up to 128 chars/,
    );
  });

  it('returns 400 when a duplicate (promotion + name) already exists', async () => {
    await repos.roster.wrestlers.create({
      promotion: 'WWE',
      name: 'Cody Rhodes',
      overallCap: 90,
    });

    const event = makeEvent({
      body: JSON.stringify({
        promotion: 'WWE',
        name: 'Cody Rhodes',
        overallCap: 88,
      }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/already exists/);
  });

  it('rejects duplicate case-insensitively (CODY vs Cody)', async () => {
    await repos.roster.wrestlers.create({
      promotion: 'WWE',
      name: 'Cody Rhodes',
      overallCap: 90,
    });

    const event = makeEvent({
      body: JSON.stringify({
        promotion: 'WWE',
        name: 'CODY RHODES',
        overallCap: 90,
      }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/already exists/);
  });

  it('allows same name under a different promotion', async () => {
    await repos.roster.wrestlers.create({
      promotion: 'WWE',
      name: 'Cody Rhodes',
      overallCap: 90,
    });

    const event = makeEvent({
      body: JSON.stringify({
        promotion: 'AEW',
        name: 'Cody Rhodes',
        overallCap: 88,
      }),
    });
    const result = await createWrestler(event, ctx, cb);
    expect(result!.statusCode).toBe(201);
  });

  it('returns 400 when body is null', async () => {
    const result = await createWrestler(makeEvent({ body: null }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when body is malformed JSON', async () => {
    const result = await createWrestler(
      makeEvent({ body: '{bad json' }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });
});
