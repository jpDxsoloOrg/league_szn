import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { update: mockUpdate },
  TableNames: { CHALLENGES: 'Challenges' },
}));

import { DynamoUserRepository } from '../DynamoUserRepository';

describe('DynamoUserRepository challenges.expireIfPending', () => {
  const { challenges } = new DynamoUserRepository();

  beforeEach(() => {
    mockUpdate.mockReset();
  });

  it('writes expired on condition that the row is still pending', async () => {
    mockUpdate.mockResolvedValue({});

    expect(await challenges.expireIfPending('c1')).toBe(true);

    expect(mockUpdate).toHaveBeenCalledWith({
      TableName: 'Challenges',
      Key: { challengeId: 'c1' },
      UpdateExpression: 'SET #s = :expired',
      ConditionExpression: '#s = :pending',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':expired': 'expired', ':pending': 'pending' },
    });
  });

  it('resolves false when the condition fails', async () => {
    const conditionFailed = Object.assign(new Error('failed'), {
      name: 'ConditionalCheckFailedException',
    });
    mockUpdate.mockRejectedValue(conditionFailed);

    expect(await challenges.expireIfPending('c1')).toBe(false);
  });

  it('rethrows any other error', async () => {
    mockUpdate.mockRejectedValue(new Error('throttled'));

    await expect(challenges.expireIfPending('c1')).rejects.toThrow('throttled');
  });
});
