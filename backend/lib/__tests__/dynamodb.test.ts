import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the entire @aws-sdk/client-dynamodb and @aws-sdk/lib-dynamodb modules
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: mockSend }),
  },
  GetCommand: vi.fn((params: any) => ({ _type: 'Get', input: params })),
  PutCommand: vi.fn((params: any) => ({ _type: 'Put', input: params })),
  UpdateCommand: vi.fn((params: any) => ({ _type: 'Update', input: params })),
  DeleteCommand: vi.fn((params: any) => ({ _type: 'Delete', input: params })),
  ScanCommand: vi.fn((params: any) => ({ _type: 'Scan', input: params })),
  QueryCommand: vi.fn((params: any) => ({ _type: 'Query', input: params })),
  TransactWriteCommand: vi.fn((params: any) => ({ _type: 'TransactWrite', input: params })),
}));

import { dynamoDb } from '../dynamodb';

describe('dynamoDb wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── get ────────────────────────────────────────────────────────────

  describe('get', () => {
    it('sends GetCommand and returns result', async () => {
      mockSend.mockResolvedValue({ Item: { id: '1', name: 'Test' } });

      const result = await dynamoDb.get({
        TableName: 'Players',
        Key: { id: '1' },
      });

      expect(mockSend).toHaveBeenCalledOnce();
      expect(result).toEqual({ Item: { id: '1', name: 'Test' } });
    });

    it('returns undefined Item when key not found', async () => {
      mockSend.mockResolvedValue({});

      const result = await dynamoDb.get({
        TableName: 'Players',
        Key: { id: 'missing' },
      });

      expect(result.Item).toBeUndefined();
    });
  });

  // ─── put ────────────────────────────────────────────────────────────

  describe('put', () => {
    it('sends PutCommand with correct params', async () => {
      mockSend.mockResolvedValue({});

      await dynamoDb.put({
        TableName: 'Players',
        Item: { id: '1', name: 'New Player' },
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.TableName).toBe('Players');
      expect(cmd.input.Item).toEqual({ id: '1', name: 'New Player' });
    });
  });

  // ─── update ─────────────────────────────────────────────────────────

  describe('update', () => {
    it('sends UpdateCommand and returns Attributes', async () => {
      mockSend.mockResolvedValue({ Attributes: { id: '1', name: 'Updated' } });

      const result = await dynamoDb.update({
        TableName: 'Players',
        Key: { id: '1' },
        UpdateExpression: 'SET #name = :name',
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: { ':name': 'Updated' },
      });

      expect(result.Attributes).toEqual({ id: '1', name: 'Updated' });
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────

  describe('delete', () => {
    it('sends DeleteCommand with correct key', async () => {
      mockSend.mockResolvedValue({});

      await dynamoDb.delete({
        TableName: 'Players',
        Key: { id: '1' },
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.Key).toEqual({ id: '1' });
    });
  });

  // ─── scan ───────────────────────────────────────────────────────────

  describe('scan', () => {
    it('sends ScanCommand and returns Items', async () => {
      mockSend.mockResolvedValue({ Items: [{ id: '1' }, { id: '2' }] });

      const result = await dynamoDb.scan({ TableName: 'Players' });

      expect(result.Items).toHaveLength(2);
    });

    it('returns empty Items array when table is empty', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const result = await dynamoDb.scan({ TableName: 'Players' });

      expect(result.Items).toEqual([]);
    });
  });

  // ─── query ──────────────────────────────────────────────────────────

  describe('query', () => {
    it('sends QueryCommand and returns Items', async () => {
      mockSend.mockResolvedValue({ Items: [{ id: '1' }], Count: 1 });

      const result = await dynamoDb.query({
        TableName: 'Players',
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: { ':id': '1' },
      });

      expect(result.Items).toEqual([{ id: '1' }]);
      expect(result.Count).toBe(1);
    });

    it('returns empty Items for no matches', async () => {
      mockSend.mockResolvedValue({ Items: [], Count: 0 });

      const result = await dynamoDb.query({
        TableName: 'Players',
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: { ':id': 'none' },
      });

      expect(result.Items).toEqual([]);
    });
  });

  // ─── transactWrite ──────────────────────────────────────────────────

  describe('transactWrite', () => {
    it('sends TransactWriteCommand', async () => {
      mockSend.mockResolvedValue({});

      await dynamoDb.transactWrite({
        TransactItems: [
          { Put: { TableName: 'Players', Item: { id: '1' } } },
        ],
      });

      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('propagates TransactionCanceledException', async () => {
      const txError = new Error('Transaction cancelled');
      txError.name = 'TransactionCanceledException';
      mockSend.mockRejectedValue(txError);

      await expect(
        dynamoDb.transactWrite({
          TransactItems: [
            { Put: { TableName: 'Players', Item: { id: '1' } } },
          ],
        }),
      ).rejects.toThrow('Transaction cancelled');
    });
  });

  // ─── scanAll (paginated) ────────────────────────────────────────────

  describe('scanAll', () => {
    it('returns all items from a single page', async () => {
      mockSend.mockResolvedValue({
        Items: [{ id: '1' }, { id: '2' }],
        LastEvaluatedKey: undefined,
      });

      const items = await dynamoDb.scanAll({ TableName: 'Players' });

      expect(items).toEqual([{ id: '1' }, { id: '2' }]);
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('paginates through multiple pages', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [{ id: '1' }],
          LastEvaluatedKey: { id: '1' },
        })
        .mockResolvedValueOnce({
          Items: [{ id: '2' }],
          LastEvaluatedKey: { id: '2' },
        })
        .mockResolvedValueOnce({
          Items: [{ id: '3' }],
          LastEvaluatedKey: undefined,
        });

      const items = await dynamoDb.scanAll({ TableName: 'Players' });

      expect(items).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('returns empty array when table is empty', async () => {
      mockSend.mockResolvedValue({ Items: undefined, LastEvaluatedKey: undefined });

      const items = await dynamoDb.scanAll({ TableName: 'Players' });

      expect(items).toEqual([]);
    });
  });

  // ─── queryAll (paginated) ───────────────────────────────────────────

  describe('queryAll', () => {
    it('returns all items from a single page', async () => {
      mockSend.mockResolvedValue({
        Items: [{ id: '1' }],
        LastEvaluatedKey: undefined,
      });

      const items = await dynamoDb.queryAll({
        TableName: 'Players',
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': 'A' },
      });

      expect(items).toEqual([{ id: '1' }]);
    });

    it('paginates through multiple pages', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [{ id: '1' }],
          LastEvaluatedKey: { id: '1' },
        })
        .mockResolvedValueOnce({
          Items: [{ id: '2' }],
          LastEvaluatedKey: undefined,
        });

      const items = await dynamoDb.queryAll({
        TableName: 'Players',
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': 'A' },
      });

      expect(items).toEqual([{ id: '1' }, { id: '2' }]);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });
});
