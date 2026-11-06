import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockScan, mockQuery, mockUpdate } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockScan: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { get: mockGet, scan: mockScan, query: mockQuery, update: mockUpdate },
  TableNames: { PLAYERS: 'Players' },
}));

import { DynamoRosterRepository } from '../DynamoRosterRepository';
import { NotFoundError } from '../../errors';

const live = { playerId: 'live', name: 'Live' };
const deleted = { playerId: 'gone', name: 'Gone', deletedAt: '2026-01-01T00:00:00.000Z' };

describe('DynamoRosterRepository players with a soft-deleted row', () => {
  const { players } = new DynamoRosterRepository();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findById reads a deleted row as missing', async () => {
    mockGet.mockResolvedValue({ Item: deleted });
    expect(await players.findById('gone')).toBeNull();
  });

  it('findByIdWithDeleted returns it for name lookups', async () => {
    mockGet.mockResolvedValue({ Item: deleted });
    expect(await players.findByIdWithDeleted('gone')).toEqual(deleted);
  });

  it('list leaves it out and listWithDeleted keeps it', async () => {
    mockScan.mockResolvedValue({ Items: [live, deleted] });
    expect(await players.list()).toEqual([live]);
    expect(await players.listWithDeleted()).toEqual([live, deleted]);
  });

  it('findByUserId skips a deleted row that still carries the account', async () => {
    mockQuery.mockResolvedValue({ Items: [deleted, live] });
    expect(await players.findByUserId('sub')).toEqual(live);
    mockQuery.mockResolvedValue({ Items: [deleted] });
    expect(await players.findByUserId('sub')).toBeNull();
  });

  it('update refuses a deleted row', async () => {
    mockUpdate.mockRejectedValue(Object.assign(new Error('failed'), { name: 'ConditionalCheckFailedException' }));

    await expect(players.update('gone', { name: 'Back' })).rejects.toBeInstanceOf(NotFoundError);

    expect(mockUpdate.mock.calls[0][0].ConditionExpression).toBe(
      'attribute_exists(playerId) AND attribute_not_exists(deletedAt)',
    );
  });
});
