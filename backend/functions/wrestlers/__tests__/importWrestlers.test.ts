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
import { handler as importWrestlers } from '../importWrestlers';
import type { WrestlerImportResult } from '../../../lib/repositories/types';

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
    path: '/wrestlers/import',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/wrestlers/import',
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

describe('importWrestlers', () => {
  it('returns 400 when body is null', async () => {
    const result = await importWrestlers(makeEvent({ body: null }), ctx, cb);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when body is malformed JSON', async () => {
    const result = await importWrestlers(
      makeEvent({ body: '{not json' }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when wrestlers is not an array', async () => {
    const result = await importWrestlers(
      makeEvent({ body: JSON.stringify({ wrestlers: 'nope' }) }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('wrestlers must be an array');
  });

  it('returns 400 when wrestlers is missing from the body', async () => {
    const result = await importWrestlers(
      makeEvent({ body: JSON.stringify({}) }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('wrestlers must be an array');
  });

  it('imports all-valid rows and returns the merged WrestlerImportResult', async () => {
    const payload = {
      wrestlers: [
        { promotion: 'WWE', name: 'Cody Rhodes', overallCap: 90 },
        { promotion: 'AEW', name: 'MJF', overallCap: 88 },
        { promotion: 'NJPW', name: 'Kazuchika Okada', overallCap: 92 },
      ],
    };

    const result = await importWrestlers(
      makeEvent({ body: JSON.stringify(payload) }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body) as WrestlerImportResult;
    expect(body.created).toBe(3);
    expect(body.skipped).toBe(0);
    expect(body.errors).toEqual([]);

    const all = await repos.roster.wrestlers.list();
    expect(all).toHaveLength(3);
  });

  it('reports per-row errors for invalid rows without aborting valid ones', async () => {
    const payload = {
      wrestlers: [
        { promotion: 'WWE', name: 'Cody Rhodes', overallCap: 90 }, // valid
        { promotion: 'NOPE', name: 'Bad Promo', overallCap: 88 }, // invalid promotion
        { promotion: 'WWE', name: 'Under Cap', overallCap: 50 }, // cap too low
        { promotion: 'WWE', name: 'Over Cap', overallCap: 100 }, // cap too high
        { promotion: 'WWE', name: '', overallCap: 90 }, // empty name
        { promotion: 'AEW', name: 'MJF', overallCap: 88 }, // valid
      ],
    };

    const result = await importWrestlers(
      makeEvent({ body: JSON.stringify(payload) }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body) as WrestlerImportResult;
    expect(body.created).toBe(2);
    // errors should contain entries for rows 1, 2, 3, 4 (zero-indexed).
    const errorRows = body.errors.map((e) => e.row).sort((a, b) => a - b);
    expect(errorRows).toEqual([1, 2, 3, 4]);

    const all = await repos.roster.wrestlers.list();
    expect(all.map((w) => w.name).sort()).toEqual(['Cody Rhodes', 'MJF']);
  });

  it('dedupes within the payload case-insensitively, keeping the first occurrence', async () => {
    const payload = {
      wrestlers: [
        { promotion: 'WWE', name: 'Cody Rhodes', overallCap: 90 },
        { promotion: 'WWE', name: 'CODY RHODES', overallCap: 85 }, // dupe
        { promotion: 'WWE', name: 'Roman Reigns', overallCap: 93 },
      ],
    };

    const result = await importWrestlers(
      makeEvent({ body: JSON.stringify(payload) }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body) as WrestlerImportResult;
    // The handler pre-dedupes row 1 internally; only 2 rows reach the repo.
    expect(body.created).toBe(2);
    expect(body.skipped).toBeGreaterThanOrEqual(1);

    const all = await repos.roster.wrestlers.list();
    expect(all).toHaveLength(2);
    // The first occurrence wins — overallCap should be 90, not 85.
    const cody = all.find((w) => w.name.toLowerCase() === 'cody rhodes');
    expect(cody?.overallCap).toBe(90);
  });

  it('skips rows that duplicate an already-existing wrestler', async () => {
    await repos.roster.wrestlers.create({
      promotion: 'WWE',
      name: 'Cody Rhodes',
      overallCap: 90,
    });

    const payload = {
      wrestlers: [
        { promotion: 'WWE', name: 'Cody Rhodes', overallCap: 85 }, // dupe of existing
        { promotion: 'AEW', name: 'MJF', overallCap: 88 }, // fresh
      ],
    };

    const result = await importWrestlers(
      makeEvent({ body: JSON.stringify(payload) }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body) as WrestlerImportResult;
    expect(body.created).toBe(1);
    expect(body.skipped).toBeGreaterThanOrEqual(1);

    const all = await repos.roster.wrestlers.list();
    expect(all).toHaveLength(2); // 1 pre-seeded + 1 newly created
  });

  it('rejects non-object rows with a row-level error', async () => {
    const payload = {
      wrestlers: [
        { promotion: 'WWE', name: 'Cody Rhodes', overallCap: 90 },
        null,
        'not-an-object',
        { promotion: 'AEW', name: 'MJF', overallCap: 88 },
      ],
    };

    const result = await importWrestlers(
      makeEvent({ body: JSON.stringify(payload) }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body) as WrestlerImportResult;
    expect(body.created).toBe(2);
    const errorRows = body.errors.map((e) => e.row).sort((a, b) => a - b);
    expect(errorRows).toContain(1);
    expect(errorRows).toContain(2);
  });
});
