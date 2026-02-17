// ─── Mocks ───────────────────────────────────────────────────────────

import { APIGatewayProxyEvent } from "aws-lambda";
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

  
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

beforeEach(() => {
  vi.clearAllMocks();
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

    const result = await handler(event);

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

    const result = await handler(event);

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

    const result = await handler(event);

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

    const result = await handler(event);

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

    const result = await handler(event);

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

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('name are required');
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

    const result = await handler(event);

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

    const result = await handler(event);

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

    const result = await handler(event);

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

    const result = await handler(event);

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

    const result = await handler(event);

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({
      divisionId: 'test-uuid-1234',
      name: 'Test2',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });
});