import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

async function invoke(
  handler: APIGatewayProxyHandler,
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const result = await handler(event, {} as never, () => {});
  expect(result).toBeDefined();
  return result as APIGatewayProxyResult;
}

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