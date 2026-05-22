import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory state held by the mocked dynamo client. The actual storage of
// items lives here so we can assert on it from each test.
const docState: { items: Map<string, Record<string, unknown>> } = {
  items: new Map(),
};
const key = (matchId: string, userId: string): string => `${matchId}#${userId}`;

// Mock the project's dynamodb wrapper. `dynamoDb.put` / `dynamoDb.get` are
// the only methods this repo uses for the keyed paths; `queryAll` is used
// for getByMatch. `docClient.send` is used for BatchGetCommand in
// getByMatchIdsForUser.
vi.mock('../../../dynamodb', () => {
  const conditionalCheckFailed = (): Error => {
    const err = new Error('Conditional check failed');
    (err as Error & { name: string }).name = 'ConditionalCheckFailedException';
    return err;
  };

  const dynamoDb = {
    put: vi.fn(async (params: {
      Item: Record<string, unknown>;
      ConditionExpression?: string;
    }) => {
      const matchId = params.Item.matchId as string;
      const userId = params.Item.userId as string;
      const k = key(matchId, userId);
      if (
        params.ConditionExpression === 'attribute_not_exists(matchId)' &&
        docState.items.has(k)
      ) {
        throw conditionalCheckFailed();
      }
      docState.items.set(k, { ...params.Item });
      return {};
    }),
    get: vi.fn(async (params: { Key: { matchId: string; userId: string } }) => {
      const item = docState.items.get(key(params.Key.matchId, params.Key.userId));
      return item ? { Item: { ...item } } : {};
    }),
    queryAll: vi.fn(async (params: { ExpressionAttributeValues: Record<string, unknown> }) => {
      const matchId = params.ExpressionAttributeValues[':matchId'] as string;
      return Array.from(docState.items.values())
        .filter((r) => (r as { matchId: string }).matchId === matchId)
        .map((r) => ({ ...r }));
    }),
  };

  const docClient = {
    send: vi.fn(async (command: unknown) => {
      // BatchGetCommand carries `input.RequestItems`. We only model the one
      // table this repo touches, so the response shape mirrors lib-dynamodb.
      const input = (command as { input: { RequestItems: Record<string, { Keys: Array<{ matchId: string; userId: string }> }> } }).input;
      const tableName = Object.keys(input.RequestItems)[0];
      const keys = input.RequestItems[tableName].Keys;
      const responses = keys
        .map((k) => docState.items.get(key(k.matchId, k.userId)))
        .filter((row): row is Record<string, unknown> => !!row)
        .map((row) => ({ ...row }));
      return {
        Responses: { [tableName]: responses },
        UnprocessedKeys: {},
      };
    }),
  };

  return {
    dynamoDb,
    docClient,
    TableNames: { MATCH_RATINGS: 'MatchRatings' },
  };
});

// BatchGetCommand from @aws-sdk/lib-dynamodb. We only need a passthrough
// constructor — the mocked docClient.send above reads from `.input`.
vi.mock('@aws-sdk/lib-dynamodb', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  class BatchGetCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return { ...real, BatchGetCommand };
});

import { DynamoMatchRatingsRepository } from '../DynamoMatchRatingsRepository';
import { RatingAlreadyExistsError } from '../../matchRatings';

describe('DynamoMatchRatingsRepository', () => {
  let repo: DynamoMatchRatingsRepository;

  beforeEach(() => {
    docState.items.clear();
    repo = new DynamoMatchRatingsRepository();
  });

  it('persists a new rating', async () => {
    const created = await repo.create({
      matchId: 'm-1',
      userId: 'u-alice',
      rating: 4.5,
    });
    expect(created.matchId).toBe('m-1');
    expect(created.userId).toBe('u-alice');
    expect(created.rating).toBe(4.5);
    expect(typeof created.createdAt).toBe('string');
  });

  it('throws RatingAlreadyExistsError when the same user rates twice', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    await expect(
      repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 5 }),
    ).rejects.toBeInstanceOf(RatingAlreadyExistsError);
  });

  it('getByMatch returns every rating for one match', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    await repo.create({ matchId: 'm-1', userId: 'u-bob', rating: 3 });
    await repo.create({ matchId: 'm-2', userId: 'u-alice', rating: 5 });

    const rows = await repo.getByMatch('m-1');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.userId).sort()).toEqual(['u-alice', 'u-bob']);
  });

  it('findByMatchAndUser returns null when absent', async () => {
    const found = await repo.findByMatchAndUser('m-1', 'u-ghost');
    expect(found).toBeNull();
  });

  it('findByMatchAndUser returns the row when present', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    const found = await repo.findByMatchAndUser('m-1', 'u-alice');
    expect(found).not.toBeNull();
    expect(found?.rating).toBe(4);
  });

  it('getByMatchIdsForUser returns only the rows the user actually rated', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    await repo.create({ matchId: 'm-2', userId: 'u-alice', rating: 5 });
    await repo.create({ matchId: 'm-3', userId: 'u-alice', rating: 2 });
    await repo.create({ matchId: 'm-1', userId: 'u-bob', rating: 3 });

    const rows = await repo.getByMatchIdsForUser(
      ['m-1', 'm-2', 'm-missing'],
      'u-alice',
    );
    expect(rows.map((r) => r.matchId).sort()).toEqual(['m-1', 'm-2']);
    expect(rows.every((r) => r.userId === 'u-alice')).toBe(true);
  });

  it('getByMatchIdsForUser short-circuits on an empty list', async () => {
    const rows = await repo.getByMatchIdsForUser([], 'u-alice');
    expect(rows).toEqual([]);
  });
});
