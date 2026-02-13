import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockGet, mockPut, mockScan, mockQuery, mockUpdate, mockDelete, mockTransactWrite } =
  vi.hoisted(() => ({
    mockGet: vi.fn(), mockPut: vi.fn(), mockScan: vi.fn(), mockQuery: vi.fn(),
    mockUpdate: vi.fn(), mockDelete: vi.fn(), mockTransactWrite: vi.fn(),
  }));
vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: mockPut, scan: mockScan, query: mockQuery,
    update: mockUpdate, delete: mockDelete, transactWrite: mockTransactWrite,
  },
  TableNames: { CHAMPIONSHIPS: 'Championships', CHAMPIONSHIP_HISTORY: 'ChampionshipHistory' },
}));
vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

import { handler as createChampionship } from '../createChampionship';
import { handler as getChampionships } from '../getChampionships';
import { handler as getChampionshipHistory } from '../getChampionshipHistory';
import { handler as updateChampionship } from '../updateChampionship';
import { handler as deleteChampionship } from '../deleteChampionship';
import { handler as vacateChampionship } from '../vacateChampionship';

const ctx = {} as Context;
const cb: Callback = () => {};
function ev(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '', requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}
const body = (r: any) => JSON.parse(r!.body);

describe('createChampionship', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a singles championship and returns 201', async () => {
    mockPut.mockResolvedValue({});
    const result = await createChampionship(
      ev({ body: JSON.stringify({ name: 'World Championship', type: 'singles' }) }), ctx, cb,
    );
    expect(result!.statusCode).toBe(201);
    const b = body(result);
    expect(b.championshipId).toBe('test-uuid-1234');
    expect(b.name).toBe('World Championship');
    expect(b.type).toBe('singles');
    expect(b.isActive).toBe(true);
    expect(b.createdAt).toBeDefined();
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it('creates a tag championship with optional fields (divisionId, imageUrl, currentChampion)', async () => {
    mockPut.mockResolvedValue({});
    const result = await createChampionship(ev({
      body: JSON.stringify({
        name: 'Tag Titles', type: 'tag', divisionId: 'div-1',
        imageUrl: 'https://example.com/belt.png', currentChampion: ['p1', 'p2'],
      }),
    }), ctx, cb);
    expect(result!.statusCode).toBe(201);
    const b = body(result);
    expect(b.type).toBe('tag');
    expect(b.divisionId).toBe('div-1');
    expect(b.imageUrl).toBe('https://example.com/belt.png');
    expect(b.currentChampion).toEqual(['p1', 'p2']);
  });

  it('returns 400 when name is missing', async () => {
    const r = await createChampionship(ev({ body: JSON.stringify({ type: 'singles' }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Name and type are required');
  });

  it('returns 400 when type is missing', async () => {
    const r = await createChampionship(ev({ body: JSON.stringify({ name: 'Belt' }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Name and type are required');
  });
  it('returns 400 when type is invalid', async () => {
    const r = await createChampionship(
      ev({ body: JSON.stringify({ name: 'Belt', type: 'triple-threat' }) }), ctx, cb,
    );
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Type must be either "singles" or "tag"');
  });

  it('returns 400 for missing body', async () => {
    const r = await createChampionship(ev({ body: null }), ctx, cb);
    expect(r!.statusCode).toBe(400);
  });
});
describe('getChampionships', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only active championships (filters isActive === false)', async () => {
    mockScan.mockResolvedValue({
      Items: [
        { championshipId: 'c1', name: 'Active', isActive: true },
        { championshipId: 'c2', name: 'Retired', isActive: false },
        { championshipId: 'c3', name: 'Default' }, // isActive not set — included
      ],
    });
    const r = await getChampionships(ev(), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const items = body(r);
    expect(items).toHaveLength(2);
    expect(items.map((c: any) => c.name)).toEqual(['Active', 'Default']);
  });

  it('returns empty array when no championships exist', async () => {
    mockScan.mockResolvedValue({ Items: undefined });
    const r = await getChampionships(ev(), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r)).toEqual([]);
  });

  it('returns 500 when scan throws an error', async () => {
    mockScan.mockRejectedValue(new Error('DynamoDB failure'));
    const r = await getChampionships(ev(), ctx, cb);
    expect(r!.statusCode).toBe(500);
    expect(body(r).message).toBe('Failed to fetch championships');
  });
});

describe('getChampionshipHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns history sorted by wonDate descending', async () => {
    mockQuery.mockResolvedValue({
      Items: [
        { championshipId: 'c1', wonDate: '2024-06-01', playerId: 'p2' },
        { championshipId: 'c1', wonDate: '2024-01-01', playerId: 'p1' },
      ],
    });
    const r = await getChampionshipHistory(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r)).toHaveLength(2);
    expect(body(r)[0].playerId).toBe('p2');
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ ScanIndexForward: false }));
  });

  it('returns empty array when no history exists', async () => {
    mockQuery.mockResolvedValue({ Items: undefined });
    const r = await getChampionshipHistory(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r)).toEqual([]);
  });

  it('returns 400 when championshipId is missing', async () => {
    const r = await getChampionshipHistory(ev({ pathParameters: null }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship ID is required');
  });
});

describe('updateChampionship', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates championship fields and returns updated item', async () => {
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1', name: 'Old' } });
    mockUpdate.mockResolvedValue({ Attributes: { championshipId: 'c1', name: 'New' } });
    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'c1' }, body: JSON.stringify({ name: 'New' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r).name).toBe('New');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ ReturnValues: 'ALL_NEW' }));
  });

  it('builds dynamic update expression for multiple fields', async () => {
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1' } });
    mockUpdate.mockResolvedValue({ Attributes: { championshipId: 'c1' } });
    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ name: 'New', type: 'tag', isActive: false }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const expr = mockUpdate.mock.calls[0][0].UpdateExpression;
    expect(expr).toContain('#name = :name');
    expect(expr).toContain('#type = :type');
    expect(expr).toContain('#isActive = :isActive');
    expect(expr).toContain('#updatedAt = :updatedAt');
  });

  it('returns 404 if championship does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'missing' }, body: JSON.stringify({ name: 'X' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(body(r).message).toBe('Championship not found');
  });

  it('returns 400 when no valid fields to update', async () => {
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1' } });
    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'c1' }, body: JSON.stringify({}),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('No valid fields to update');
  });

  it('returns 400 when championshipId is missing', async () => {
    const r = await updateChampionship(ev({
      pathParameters: null, body: JSON.stringify({ name: 'X' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship ID is required');
  });

  it('updates imageUrl field', async () => {
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1', name: 'Belt' } });
    mockUpdate.mockResolvedValue({
      Attributes: { championshipId: 'c1', name: 'Belt', imageUrl: 'https://example.com/belt.png' },
    });
    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ imageUrl: 'https://example.com/belt.png' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const expr = mockUpdate.mock.calls[0][0].UpdateExpression;
    expect(expr).toContain('#imageUrl');
  });

  it('updates currentChampion field', async () => {
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1', name: 'Belt' } });
    mockUpdate.mockResolvedValue({
      Attributes: { championshipId: 'c1', name: 'Belt', currentChampion: 'p1' },
    });
    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ currentChampion: 'p1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const expr = mockUpdate.mock.calls[0][0].UpdateExpression;
    expect(expr).toContain('#currentChampion');
  });

  it('updates divisionId field', async () => {
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1', name: 'Belt' } });
    mockUpdate.mockResolvedValue({
      Attributes: { championshipId: 'c1', name: 'Belt', divisionId: 'div-1' },
    });
    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ divisionId: 'div-1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const expr = mockUpdate.mock.calls[0][0].UpdateExpression;
    expect(expr).toContain('#divisionId');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));
    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ name: 'New' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(500);
    expect(body(r).message).toBe('Failed to update championship');
  });
});

describe('deleteChampionship', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes championship and cascades to history, returns 204', async () => {
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1' } });
    mockDelete.mockResolvedValue({});
    mockQuery.mockResolvedValue({
      Items: [
        { championshipId: 'c1', wonDate: '2024-01-01' },
        { championshipId: 'c1', wonDate: '2024-06-01' },
      ],
    });
    const r = await deleteChampionship(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(3); // 1 championship + 2 history
  });

  it('deletes championship with no history', async () => {
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1' } });
    mockDelete.mockResolvedValue({});
    mockQuery.mockResolvedValue({ Items: [] });
    const r = await deleteChampionship(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('returns 404 if championship not found', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const r = await deleteChampionship(ev({ pathParameters: { championshipId: 'missing' } }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(body(r).message).toBe('Championship not found');
  });

  it('returns 400 when championshipId is missing', async () => {
    const r = await deleteChampionship(ev({ pathParameters: null }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship ID is required');
  });
});

describe('vacateChampionship', () => {
  beforeEach(() => vi.clearAllMocks());

  it('vacates championship and closes current reign with daysHeld', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { championshipId: 'c1', currentChampion: 'p1' } })
      .mockResolvedValueOnce({ Item: { championshipId: 'c1' } });
    mockQuery.mockResolvedValue({
      Items: [{ championshipId: 'c1', wonDate: '2024-01-01', playerId: 'p1' }],
    });
    mockTransactWrite.mockResolvedValue({});
    const r = await vacateChampionship(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(mockTransactWrite).toHaveBeenCalledOnce();
    const txItems = mockTransactWrite.mock.calls[0][0].TransactItems;
    expect(txItems).toHaveLength(2);
    expect(txItems[0].Update.UpdateExpression).toContain('REMOVE currentChampion');
    expect(txItems[1].Update.UpdateExpression).toContain('lostDate');
    expect(txItems[1].Update.UpdateExpression).toContain('daysHeld');
  });

  it('vacates championship with no open history record', async () => {
    mockGet
      .mockResolvedValueOnce({ Item: { championshipId: 'c1', currentChampion: 'p1' } })
      .mockResolvedValueOnce({ Item: { championshipId: 'c1' } });
    mockQuery.mockResolvedValue({ Items: [] });
    mockTransactWrite.mockResolvedValue({});
    const r = await vacateChampionship(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(mockTransactWrite.mock.calls[0][0].TransactItems).toHaveLength(1);
  });

  it('returns 400 if championship is already vacant', async () => {
    mockGet.mockResolvedValue({ Item: { championshipId: 'c1', currentChampion: undefined } });
    const r = await vacateChampionship(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship is already vacant');
  });

  it('returns 404 if championship not found', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const r = await vacateChampionship(ev({ pathParameters: { championshipId: 'missing' } }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(body(r).message).toBe('Championship not found');
  });

  it('returns 400 when championshipId is missing', async () => {
    const r = await vacateChampionship(ev({ pathParameters: null }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship ID is required');
  });
});
