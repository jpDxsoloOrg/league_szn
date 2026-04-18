import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';

import { handler as getTournaments } from '../getTournaments';

// --- Helpers ---

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

// --- getTournaments ---

describe('getTournaments', () => {
  it('returns all tournaments sorted by createdAt descending', async () => {
    await repos.tournaments.create({
      tournamentId: 't1', name: 'Old Tournament', createdAt: '2024-01-01T00:00:00Z',
    } as Record<string, unknown>);
    await repos.tournaments.create({
      tournamentId: 't2', name: 'New Tournament', createdAt: '2024-06-01T00:00:00Z',
    } as Record<string, unknown>);

    const result = await getTournaments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe('New Tournament');
    expect(body[1].name).toBe('Old Tournament');
  });

  it('returns empty array when no tournaments exist', async () => {
    const result = await getTournaments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 when list throws', async () => {
    vi.spyOn(repos.tournaments, 'list').mockRejectedValue(new Error('DB failure'));

    const result = await getTournaments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch tournaments');
  });
});
