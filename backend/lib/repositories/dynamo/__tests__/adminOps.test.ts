import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockScanAll, mockPut, mockDelete } = vi.hoisted(() => ({
  mockScanAll: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { scanAll: mockScanAll, put: mockPut, delete: mockDelete },
  TableNames: new Proxy({}, { get: (_target, name) => `table-${String(name)}` }),
}));

import { dynamoClearAllData, dynamoExportAllData, dynamoImportAllData } from '../adminOps';
import { EXPORT_DATASET_KEYS } from '../../../../functions/admin/dataTransferConfig';

beforeEach(() => {
  vi.clearAllMocks();
  mockScanAll.mockResolvedValue([]);
  mockPut.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('dynamoExportAllData', () => {
  it('covers exactly the shared dataset list', async () => {
    const data = await dynamoExportAllData();

    expect(Object.keys(data).sort()).toEqual([...EXPORT_DATASET_KEYS].sort());
  });

  it('leaves out a table it cannot read and exports the rest', async () => {
    mockScanAll.mockImplementation(async ({ TableName }: { TableName: string }) => {
      if (TableName === 'table-MATCHES') throw new Error('denied');
      return [{ id: TableName }];
    });

    const data = await dynamoExportAllData();

    expect(data.matches).toBeUndefined();
    expect(data.players).toEqual([{ id: 'table-PLAYERS' }]);
    expect(data.matchRatings).toEqual([{ id: 'table-MATCH_RATINGS' }]);
  });
});

describe('dynamoImportAllData', () => {
  it('leaves tables with no dataset untouched', async () => {
    mockScanAll.mockResolvedValue([{ playerId: 'old', matchId: 'old', date: 'd' }]);

    const counts = await dynamoImportAllData({ players: [{ playerId: 'new' }] });

    expect(counts).toEqual({ players: 1 });
    expect(mockScanAll).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls[0][0].TableName).toBe('table-PLAYERS');
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('clears a table whose dataset is present but empty', async () => {
    mockScanAll.mockResolvedValue([{ playerId: 'old' }]);

    const counts = await dynamoImportAllData({ players: [] });

    expect(counts).toEqual({ players: 0 });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockPut).not.toHaveBeenCalled();
  });
});

describe('dynamoClearAllData', () => {
  it('reports every dataset and no table without a configured name', async () => {
    const results = await dynamoClearAllData();

    expect(Object.keys(results).sort()).toEqual([...EXPORT_DATASET_KEYS].sort());
    expect(mockScanAll.mock.calls.every(([params]) => typeof params.TableName === 'string')).toBe(true);
  });
});
