// ─── Mocks ───────────────────────────────────────────────────────────

import { APIGatewayProxyEvent, Context, Callback, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlerFactory } from "../handlers";
import { badRequest } from "../response";

const { mockGet, mockPut, mockScan, mockQuery, mockUpdate, mockDelete, mockScanAll, mockQueryAll } = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockPut: vi.fn(),
    mockScan: vi.fn(),
    mockQuery: vi.fn(),
    mockUpdate: vi.fn(),
    mockDelete: vi.fn(),
    mockScanAll: vi.fn(),
    mockQueryAll: vi.fn(),
  }));
  
  vi.mock('../dynamodb', () => ({
    dynamoDb: {
      get: mockGet,
      put: mockPut,
      scan: mockScan,
      query: mockQuery,
      update: mockUpdate,
      delete: mockDelete,
      scanAll: mockScanAll,
      queryAll: mockQueryAll,
    },
    TableNames: {
      DIVISIONS: 'Divisions'
    },
  }));

  
  const ctx = {} as Context;
  const cb = (() => {}) as Callback<APIGatewayProxyResult>;
  
  async function invoke(
    handler: APIGatewayProxyHandler,
    event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> {
    const result = await handler(event, ctx, cb);
    expect(result).toBeDefined();
    return result as APIGatewayProxyResult;
  }

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => (++uuidCounter === 1 ? 'test-uuid-1234' : `test-uuid-${uuidCounter}`),
}));

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  mockPut.mockResolvedValue(undefined);
});

function makeEvent(body: string | null): APIGatewayProxyEvent {
  return {
    body,
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
    requestContext: {} as any,
  };
}


describe('createCreateHandler', () => {
  it('happy path', async () => {
    const event = makeEvent(JSON.stringify({ name: 'Test' }));

    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name']
    });

    const result = await invoke(handler, event);

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({
      divisionId: 'test-uuid-1234',
      name: 'Test',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  
  });

  //Happy path: required + optional fields — optional fields appear in item

   //Happy path: required + optional fields — optional fields appear in item
   it('happy path: required + optional fields', async () => {
    const event = makeEvent(JSON.stringify({ name: 'Test', description: 'Test description' }));

    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name'],
      optionalFields: ['description']
    });

    const result = await invoke(handler, event);

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({
      divisionId: 'test-uuid-1234',
      name: 'Test',
      description: 'Test description',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });
//Happy path: required + nullable fields — nullable fields get || null treatment
  it('happy path: required + nullable fields', async () => {
    const event = makeEvent(JSON.stringify({ name: 'Test', description: null }));

    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name'],
      nullableFields: ['description']
    });

    const result = await invoke(handler, event);

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({
      divisionId: 'test-uuid-1234',
      name: 'Test',
      description: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  // - Missing body (null)
  it('missing body', async () => {
    const event = makeEvent(null);

    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name']
    });

    const result = await invoke(handler, event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Request body is required');
  });

  // - Invalid JSON
  it('invalid JSON', async () => {
    const event = makeEvent('invalid json');

    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name']
    });

    const result = await invoke(handler, event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid JSON in request body');
  });

  // - Missing required field
  it('missing required field', async () => {
    const event = makeEvent(JSON.stringify({}));

    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name']
    });

      const result = await invoke(handler, event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('name is required');
  });

  // - DynamoDB put fails (500)
  it('DynamoDB put fails', async () => {
    const event = makeEvent(JSON.stringify({ name: 'Test' }));
    mockPut.mockRejectedValue(new Error('DynamoDB failure'));
    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name']
    });

    const result = await invoke(handler, event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Failed to create division');
  }); 

  // - Defaults are applied correctly
  it('defaults are applied correctly', async () => {
    const event = makeEvent(JSON.stringify({ name: 'Test' }));

    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name'],
      defaults: { wins: 0, losses: 0 },
    });

    const result = await invoke(handler, event);

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({
      divisionId: 'test-uuid-1234',
      name: 'Test',
      wins: 0,
      losses: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  // - Validate hook returns an error — factory short-circuits
  it('validate hook returns an error', async () => {
    const event = makeEvent(JSON.stringify({ name: 'Test' }));

    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name'],
      validate: () => Promise.resolve(badRequest('Invalid JSON in request body')),
    });

    const result = await invoke(handler, event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid JSON in request body');
    expect(mockPut).not.toHaveBeenCalled();
  });

  // - Validate hook returns null — factory proceeds
  it('validate hook returns null', async () => {
    const event = makeEvent(JSON.stringify({ name: 'Test' }));

    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name'],
      validate: () => Promise.resolve(null)
    });

    const result = await invoke(handler, event);

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({ 
      divisionId: 'test-uuid-1234',
      name: 'Test',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  // - buildItem hook overrides item assembly
  it('buildItem hook overrides item assembly', async () => {
    const event = makeEvent(JSON.stringify({ name: 'Test' }));

    const handler = handlerFactory({
      tableName: 'DIVISIONS',
      idField: 'divisionId',
      entityName: 'division',
      requiredFields: ['name'],
      buildItem: (_body, baseItem) => Promise.resolve({ ...baseItem, name: 'Test2' })
    });

    const result = await invoke(handler, event);

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({
      divisionId: 'test-uuid-1234',
      name: 'Test2',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Repository-backed factories
// ═══════════════════════════════════════════════════════════════════

import {
  createHandlerFactory,
  getHandlerFactory,
  listHandlerFactory,
  updateHandlerFactory,
  deleteHandlerFactory,
} from '../handlers';
import { InMemoryDivisionsRepository } from '../repositories/inMemory';
import { ConflictError } from '../repositories/errors';
import type { Division } from '../repositories/types';
import type { DivisionCreateInput, DivisionPatch } from '../repositories/DivisionsRepository';

function makeRepoEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
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
    requestContext: {} as any,
    ...overrides,
  };
}

describe('createHandlerFactory (repo-backed)', () => {
  let repo: InMemoryDivisionsRepository;
  beforeEach(() => { repo = new InMemoryDivisionsRepository(); });

  it('creates an item via the repo and returns 201', async () => {
    const handler = createHandlerFactory<DivisionCreateInput, Division>({
      repo: () => repo,
      entityName: 'division',
      requiredFields: ['name'],
      optionalFields: ['description'],
    });

    const result = await invoke(handler, makeRepoEvent({ body: JSON.stringify({ name: 'Raw' }) }));

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.name).toBe('Raw');
    expect(body.divisionId).toBeDefined();
    expect(repo.store.size).toBe(1);
  });

  it('returns 400 when a required field is missing', async () => {
    const handler = createHandlerFactory<DivisionCreateInput, Division>({
      repo: () => repo,
      entityName: 'division',
      requiredFields: ['name'],
    });

    const result = await invoke(handler, makeRepoEvent({ body: JSON.stringify({}) }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('name is required');
    expect(repo.store.size).toBe(0);
  });

  it('returns 400 when body is null', async () => {
    const handler = createHandlerFactory<DivisionCreateInput, Division>({
      repo: () => repo,
      entityName: 'division',
      requiredFields: ['name'],
    });

    const result = await invoke(handler, makeRepoEvent({ body: null }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Request body is required');
  });

  it('maps ConflictError to 409', async () => {
    const throwingRepo = {
      create: vi.fn().mockRejectedValue(new ConflictError('name must be unique')),
    };
    const handler = createHandlerFactory<DivisionCreateInput, Division>({
      repo: () => throwingRepo,
      entityName: 'division',
      requiredFields: ['name'],
    });

    const result = await invoke(handler, makeRepoEvent({ body: JSON.stringify({ name: 'Raw' }) }));

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).message).toBe('name must be unique');
  });

  it('maps unexpected errors to 500', async () => {
    const throwingRepo = {
      create: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const handler = createHandlerFactory<DivisionCreateInput, Division>({
      repo: () => throwingRepo,
      entityName: 'division',
      requiredFields: ['name'],
    });

    const result = await invoke(handler, makeRepoEvent({ body: JSON.stringify({ name: 'Raw' }) }));

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Failed to create division');
  });
});

describe('getHandlerFactory', () => {
  let repo: InMemoryDivisionsRepository;
  beforeEach(() => { repo = new InMemoryDivisionsRepository(); });

  it('returns 200 with the item when found', async () => {
    const created = await repo.create({ name: 'Raw' });
    const handler = getHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
    });

    const result = await invoke(
      handler,
      makeRepoEvent({ pathParameters: { divisionId: created.divisionId } }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).name).toBe('Raw');
  });

  it('returns 404 when the item does not exist', async () => {
    const handler = getHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
    });

    const result = await invoke(
      handler,
      makeRepoEvent({ pathParameters: { divisionId: 'missing' } }),
    );

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Division not found');
  });

  it('returns 400 when idParam is missing', async () => {
    const handler = getHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
    });

    const result = await invoke(handler, makeRepoEvent({ pathParameters: null }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Division ID is required');
  });

  it('uses entityLabel for error messages when provided', async () => {
    const handler = getHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'match type',
      entityLabel: 'Match type',
      idParam: 'matchTypeId',
    });

    const result = await invoke(
      handler,
      makeRepoEvent({ pathParameters: { matchTypeId: 'missing' } }),
    );

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Match type not found');
  });
});

describe('listHandlerFactory', () => {
  let repo: InMemoryDivisionsRepository;
  beforeEach(() => { repo = new InMemoryDivisionsRepository(); });

  it('returns all items from the repo', async () => {
    await repo.create({ name: 'Raw' });
    await repo.create({ name: 'SmackDown' });
    const handler = listHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'divisions',
    });

    const result = await invoke(handler, makeRepoEvent());

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toHaveLength(2);
  });

  it('returns empty array when repo is empty', async () => {
    const handler = listHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'divisions',
    });

    const result = await invoke(handler, makeRepoEvent());

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('returns 500 when the repo throws', async () => {
    const throwingRepo = { list: vi.fn().mockRejectedValue(new Error('boom')) };
    const handler = listHandlerFactory<Division>({
      repo: () => throwingRepo,
      entityName: 'divisions',
    });

    const result = await invoke(handler, makeRepoEvent());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Failed to fetch divisions list');
  });
});

describe('updateHandlerFactory', () => {
  let repo: InMemoryDivisionsRepository;
  beforeEach(() => { repo = new InMemoryDivisionsRepository(); });

  it('updates the item and returns 200', async () => {
    const created = await repo.create({ name: 'Raw' });
    const handler = updateHandlerFactory<DivisionPatch, Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
      patchFields: ['name', 'description'],
    });

    const result = await invoke(handler, makeRepoEvent({
      pathParameters: { divisionId: created.divisionId },
      body: JSON.stringify({ name: 'Updated' }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).name).toBe('Updated');
  });

  it('returns 400 when the patch has no valid fields', async () => {
    const handler = updateHandlerFactory<DivisionPatch, Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
      patchFields: ['name', 'description'],
    });

    const result = await invoke(handler, makeRepoEvent({
      pathParameters: { divisionId: 'id-1' },
      body: JSON.stringify({ ignored: 'value' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('No valid fields to update');
  });

  it('returns 404 when the repo throws NotFoundError', async () => {
    const handler = updateHandlerFactory<DivisionPatch, Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
      patchFields: ['name'],
    });

    const result = await invoke(handler, makeRepoEvent({
      pathParameters: { divisionId: 'missing' },
      body: JSON.stringify({ name: 'X' }),
    }));

    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when idParam is missing', async () => {
    const handler = updateHandlerFactory<DivisionPatch, Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
      patchFields: ['name'],
    });

    const result = await invoke(handler, makeRepoEvent({
      pathParameters: null,
      body: JSON.stringify({ name: 'X' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Division ID is required');
  });
});

describe('deleteHandlerFactory', () => {
  let repo: InMemoryDivisionsRepository;
  beforeEach(() => { repo = new InMemoryDivisionsRepository(); });

  it('deletes the item and returns 204', async () => {
    const created = await repo.create({ name: 'Raw' });
    const handler = deleteHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
    });

    const result = await invoke(handler, makeRepoEvent({
      pathParameters: { divisionId: created.divisionId },
    }));

    expect(result.statusCode).toBe(204);
    expect(await repo.findById(created.divisionId)).toBeNull();
  });

  it('returns 404 when the item does not exist', async () => {
    const handler = deleteHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
    });

    const result = await invoke(handler, makeRepoEvent({
      pathParameters: { divisionId: 'missing' },
    }));

    expect(result.statusCode).toBe(404);
  });

  it('runs preDelete hook and propagates ConflictError as 409', async () => {
    const created = await repo.create({ name: 'Raw' });
    const handler = deleteHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
      preDelete: async () => {
        throw new ConflictError('in use');
      },
    });

    const result = await invoke(handler, makeRepoEvent({
      pathParameters: { divisionId: created.divisionId },
    }));

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).message).toBe('in use');
    expect(await repo.findById(created.divisionId)).not.toBeNull();
  });

  it('preDelete hook receives id and item', async () => {
    const created = await repo.create({ name: 'Raw' });
    const preDelete = vi.fn().mockResolvedValue(undefined);
    const handler = deleteHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
      preDelete,
    });

    await invoke(handler, makeRepoEvent({
      pathParameters: { divisionId: created.divisionId },
    }));

    expect(preDelete).toHaveBeenCalledWith(
      created.divisionId,
      expect.objectContaining({ name: 'Raw' }),
    );
  });

  it('returns 400 when idParam is missing', async () => {
    const handler = deleteHandlerFactory<Division>({
      repo: () => repo,
      entityName: 'division',
      idParam: 'divisionId',
    });

    const result = await invoke(handler, makeRepoEvent({ pathParameters: null }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Division ID is required');
  });
});