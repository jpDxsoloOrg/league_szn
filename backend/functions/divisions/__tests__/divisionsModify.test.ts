import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as updateDivision } from '../updateDivision';
import { handler as deleteDivision } from '../deleteDivision';

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
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('updateDivision', () => {
  it('updates division name and returns updated record', async () => {
    const created = await repos.divisions.create({ name: 'Raw' });

    const event = makeEvent({
      pathParameters: { divisionId: created.divisionId },
      body: JSON.stringify({ name: 'Raw Updated' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).name).toBe('Raw Updated');
    const stored = await repos.divisions.findById(created.divisionId);
    expect(stored?.name).toBe('Raw Updated');
  });

  it('updates division description', async () => {
    const created = await repos.divisions.create({ name: 'Raw' });

    const event = makeEvent({
      pathParameters: { divisionId: created.divisionId },
      body: JSON.stringify({ description: 'Monday Night Raw' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).description).toBe('Monday Night Raw');
  });

  it('refreshes the updatedAt timestamp on every update', async () => {
    const created = await repos.divisions.create({ name: 'Raw' });
    const before = created.updatedAt;
    await new Promise((r) => setTimeout(r, 2));

    const event = makeEvent({
      pathParameters: { divisionId: created.divisionId },
      body: JSON.stringify({ name: 'New Name' }),
    });

    const result = await updateDivision(event, ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.updatedAt).toBeDefined();
    expect(body.updatedAt).not.toBe(before);
  });

  it('returns 400 when divisionId is missing from path', async () => {
    const event = makeEvent({
      pathParameters: null,
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Division ID is required');
  });

  it('returns 400 when body is null', async () => {
    const event = makeEvent({
      pathParameters: { divisionId: 'div-1' },
      body: null,
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when no valid patch fields are provided', async () => {
    const event = makeEvent({
      pathParameters: { divisionId: 'div-1' },
      body: JSON.stringify({ unrelated: 'ignored' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('No valid fields to update');
  });

  it('returns 404 when division does not exist', async () => {
    const event = makeEvent({
      pathParameters: { divisionId: 'nonexistent' },
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toContain('nonexistent');
  });

  it('returns 500 when the repository throws', async () => {
    repos.divisions.update = vi.fn().mockRejectedValue(new Error('boom'));

    const event = makeEvent({
      pathParameters: { divisionId: 'div-1' },
      body: JSON.stringify({ name: 'X' }),
    });

    const result = await updateDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to update division');
  });
});

describe('deleteDivision', () => {
  it('deletes division and returns 204', async () => {
    const created = await repos.divisions.create({ name: 'Raw' });

    const event = makeEvent({ pathParameters: { divisionId: created.divisionId } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(await repos.divisions.findById(created.divisionId)).toBeNull();
  });

  it('returns 400 when divisionId is missing from path', async () => {
    const result = await deleteDivision(makeEvent({ pathParameters: null }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Division ID is required');
  });

  it('returns 404 when division does not exist', async () => {
    const event = makeEvent({ pathParameters: { divisionId: 'nonexistent' } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Division not found');
  });

  it('returns 409 when players are assigned to the division', async () => {
    const created = await repos.divisions.create({ name: 'Raw' });
    // Create players assigned to this division via the repo
    const p1 = await repos.players.create({ name: 'John', currentWrestler: 'Wrestler1' });
    await repos.players.update(p1.playerId, { divisionId: created.divisionId });
    const p2 = await repos.players.create({ name: 'Jane', currentWrestler: 'Wrestler2' });
    await repos.players.update(p2.playerId, { divisionId: created.divisionId });

    const event = makeEvent({ pathParameters: { divisionId: created.divisionId } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('2 player(s)');
    expect(JSON.parse(result!.body).message).toContain('Cannot delete division');
    expect(await repos.divisions.findById(created.divisionId)).not.toBeNull();
  });

  it('returns 409 with correct count for single player', async () => {
    const created = await repos.divisions.create({ name: 'Raw' });
    const p1 = await repos.players.create({ name: 'John', currentWrestler: 'Wrestler1' });
    await repos.players.update(p1.playerId, { divisionId: created.divisionId });

    const event = makeEvent({ pathParameters: { divisionId: created.divisionId } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('1 player(s)');
  });

  it('deletes when no players are assigned', async () => {
    const created = await repos.divisions.create({ name: 'Raw' });

    const event = makeEvent({ pathParameters: { divisionId: created.divisionId } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(await repos.divisions.findById(created.divisionId)).toBeNull();
  });

  it('returns 500 when the repository throws', async () => {
    repos.divisions.findById = vi.fn().mockRejectedValue(new Error('boom'));

    const event = makeEvent({ pathParameters: { divisionId: 'div-1' } });

    const result = await deleteDivision(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to delete division');
  });
});
