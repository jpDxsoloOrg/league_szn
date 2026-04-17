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
import { handler as getDivisions } from '../getDivisions';
import { handler as createDivision } from '../createDivision';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
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

describe('getDivisions', () => {
  it('returns all divisions', async () => {
    await repos.divisions.create({ name: 'Raw' });
    await repos.divisions.create({ name: 'SmackDown' });

    const result = await getDivisions(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    expect(body.map((d: { name: string }) => d.name).sort()).toEqual(['Raw', 'SmackDown']);
  });

  it('returns empty array when no divisions exist', async () => {
    const result = await getDivisions(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 when the repository throws', async () => {
    repos.divisions.list = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await getDivisions(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch divisions list');
  });
});

describe('createDivision', () => {
  it('creates a division with name only and returns 201', async () => {
    const event = makeEvent({ body: JSON.stringify({ name: 'Raw' }) });

    const result = await createDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.divisionId).toBe('test-uuid-1');
    expect(body.name).toBe('Raw');
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
    expect(body.description).toBeUndefined();
    expect(await repos.divisions.findById('test-uuid-1')).not.toBeNull();
  });

  it('creates a division with name and description', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'SmackDown', description: 'Friday Night SmackDown' }),
    });

    const result = await createDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(201);
    const body = JSON.parse(result!.body);
    expect(body.name).toBe('SmackDown');
    expect(body.description).toBe('Friday Night SmackDown');
  });

  it('returns 400 when name is missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ description: 'No name' }) });

    const result = await createDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('name is required');
  });

  it('returns 400 when name is empty string', async () => {
    const event = makeEvent({ body: JSON.stringify({ name: '' }) });

    const result = await createDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('name is required');
  });

  it('returns 400 when body is null', async () => {
    const result = await createDivision(makeEvent({ body: null }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when body is malformed JSON', async () => {
    const result = await createDivision(makeEvent({ body: '{bad json' }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 500 when the repository throws', async () => {
    repos.divisions.create = vi.fn().mockRejectedValue(new Error('boom'));
    const event = makeEvent({ body: JSON.stringify({ name: 'Raw' }) });

    const result = await createDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to create division');
  });
});
