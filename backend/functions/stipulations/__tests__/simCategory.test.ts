import { describe, it, expect, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Callback, Context } from 'aws-lambda';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as createStipulation } from '../createStipulation';
import { handler as updateStipulation } from '../updateStipulation';
import { handler as createMatchType } from '../../matchTypes/createMatchType';
import { handler as updateMatchType } from '../../matchTypes/updateMatchType';

// BLD-16: stipulation and match type handlers accept and validate simCategory.

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(body: unknown, pathParameters: Record<string, string> | null = null): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/',
    pathParameters,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

beforeEach(() => {
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('stipulation simCategory', () => {
  it('stores a valid category on create', async () => {
    const result = await createStipulation(makeEvent({ name: 'Ladder Match', simCategory: 'highRisk' }), ctx, cb);
    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).simCategory).toBe('highRisk');
  });

  it('leaves the category unset when omitted', async () => {
    const result = await createStipulation(makeEvent({ name: 'Standard' }), ctx, cb);
    expect(result!.statusCode).toBe(201);
    expect(JSON.parse(result!.body).simCategory).toBeUndefined();
  });

  it('rejects an unknown category on create and stores nothing', async () => {
    const result = await createStipulation(makeEvent({ name: 'Ladder Match', simCategory: 'ladder' }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(await repos.competition.stipulations.list()).toHaveLength(0);
  });

  it('updates the category and rejects unknown values', async () => {
    const stipulation = await repos.competition.stipulations.create({ name: 'Steel Cage' });
    const path = { stipulationId: stipulation.stipulationId };

    const ok = await updateStipulation(makeEvent({ simCategory: 'cage' }, path), ctx, cb);
    expect(ok!.statusCode).toBe(200);
    expect((await repos.competition.stipulations.findById(stipulation.stipulationId))?.simCategory).toBe('cage');

    const bad = await updateStipulation(makeEvent({ simCategory: 'steel' }, path), ctx, cb);
    expect(bad!.statusCode).toBe(400);
    expect((await repos.competition.stipulations.findById(stipulation.stipulationId))?.simCategory).toBe('cage');
  });
});

describe('match type simCategory', () => {
  it('stores a valid category on create and rejects unknown ones', async () => {
    const ok = await createMatchType(makeEvent({ name: 'Iron Man', simCategory: 'endurance' }), ctx, cb);
    expect(ok!.statusCode).toBe(201);
    expect(JSON.parse(ok!.body).simCategory).toBe('endurance');

    const bad = await createMatchType(makeEvent({ name: 'Singles', simCategory: 'Endurance' }), ctx, cb);
    expect(bad!.statusCode).toBe(400);
  });

  it('updates the category and rejects unknown values', async () => {
    const matchType = await repos.competition.matchTypes.create({ name: 'Iron Man' });
    const path = { matchTypeId: matchType.matchTypeId };

    const ok = await updateMatchType(makeEvent({ simCategory: 'endurance' }, path), ctx, cb);
    expect(ok!.statusCode).toBe(200);
    expect(JSON.parse(ok!.body).simCategory).toBe('endurance');

    const bad = await updateMatchType(makeEvent({ simCategory: 42 }, path), ctx, cb);
    expect(bad!.statusCode).toBe(400);
  });
});
