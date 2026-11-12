import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTransactWrite } = vi.hoisted(() => ({ mockTransactWrite: vi.fn() }));

vi.mock('../../dynamodb', () => ({
  dynamoDb: { transactWrite: mockTransactWrite },
  TableNames: {
    PLAYER_PROGRESSION: 'PlayerProgression',
    PROGRESSION_EVENTS: 'ProgressionEvents',
  },
}));

import { DynamoUnitOfWork } from '../dynamo/DynamoUnitOfWork';
import { buildInMemoryRepositories } from '../inMemory';
import { ConcurrencyError } from '../errors';
import type { PlayerProgression, ProgressionEvent } from '../types';

const progression: PlayerProgression = {
  playerId: 'p1',
  trackId: 't1',
  progressPct: 60,
  goals: [{ goalId: 'g1', current: 6, threshold: 10, met: false }],
  computedAt: '2026-11-12T00:00:00.000Z',
};

const executed: ProgressionEvent = {
  eventId: 'e1',
  playerId: 'p1',
  trackId: 't1',
  kind: 'callup',
  type: 'executed',
  fromDivisionId: 'd-young',
  toDivisionId: 'd-main',
  actorUserId: 'admin-1',
  createdAt: '2026-11-12T01:00:00.000Z',
};

const consideration = {
  status: 'considering' as const,
  markedBy: 'admin-1',
  markedAt: '2026-11-11T00:00:00.000Z',
};

interface TransactItem {
  Delete?: { TableName: string; Key: Record<string, unknown> };
  Put?: { TableName: string; Item: Record<string, unknown> };
  Update?: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ExpressionAttributeNames: Record<string, string>;
    ExpressionAttributeValues: Record<string, unknown>;
  };
}

describe('DynamoUnitOfWork progression writes', () => {
  beforeEach(() => {
    mockTransactWrite.mockReset();
    mockTransactWrite.mockResolvedValue({});
  });

  it('stages an upsert that SETs only computed fields and a Put for the event', async () => {
    const uow = new DynamoUnitOfWork();
    uow.upsertPlayerProgression(progression);
    uow.appendProgressionEvent(executed);
    await uow.commit();

    const items = mockTransactWrite.mock.calls[0][0].TransactItems as TransactItem[];
    expect(items).toHaveLength(2);

    const update = items[0].Update!;
    expect(update.TableName).toBe('PlayerProgression');
    expect(update.Key).toEqual({ playerId: 'p1', trackId: 't1' });
    expect(update.UpdateExpression).toBe(
      'SET #progressPct = :progressPct, #goals = :goals, #computedAt = :computedAt',
    );
    expect(Object.values(update.ExpressionAttributeNames)).not.toContain('consideration');

    expect(items[1].Put).toEqual({
      TableName: 'ProgressionEvents',
      Item: { ...executed, createdAtEventId: '2026-11-12T01:00:00.000Z#e1' },
    });
  });

  it('SETs consideration when the upsert carries one', () => {
    const uow = new DynamoUnitOfWork();
    uow.upsertPlayerProgression({ ...progression, consideration });
    const [item] = (uow as unknown as { staged: TransactItem[] }).staged;
    expect(item.Update!.UpdateExpression).toContain('#consideration = :consideration');
    expect(item.Update!.ExpressionAttributeValues[':consideration']).toEqual(consideration);
  });
});

describe('deletePlayerProgression', () => {
  it('stages a Delete keyed by playerId and trackId', () => {
    const uow = new DynamoUnitOfWork();
    uow.deletePlayerProgression('p1', 't1');
    const [item] = (uow as unknown as { staged: TransactItem[] }).staged;
    expect(item.Delete).toEqual({ TableName: 'PlayerProgression', Key: { playerId: 'p1', trackId: 't1' } });
  });

  it('removes the in-memory row on commit only', async () => {
    const repos = buildInMemoryRepositories();
    await repos.progression.upsertPlayerProgression(progression);

    await expect(
      repos.runInTransaction(async (tx) => {
        tx.deletePlayerProgression('p1', 't1');
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await repos.progression.getPlayerProgression('p1', 't1')).not.toBeNull();

    await repos.runInTransaction(async (tx) => {
      tx.deletePlayerProgression('p1', 't1');
    });
    expect(await repos.progression.getPlayerProgression('p1', 't1')).toBeNull();
  });

  it('lists events of one type across players, newest first', async () => {
    const repos = buildInMemoryRepositories();
    await repos.progression.appendEvent(executed);
    await repos.progression.appendEvent({ ...executed, eventId: 'e2', playerId: 'p2', createdAt: '2026-11-12T02:00:00.000Z' });
    await repos.progression.appendEvent({ ...executed, eventId: 'e3', type: 'consideration_added' });

    const rows = await repos.progression.listEventsByType('executed');
    expect(rows.map((e) => e.eventId)).toEqual(['e2', 'e1']);
  });
});

describe('InMemory runInTransaction progression writes', () => {
  it('applies both writes on commit and keeps an existing consideration', async () => {
    const repos = buildInMemoryRepositories();
    await repos.progression.upsertPlayerProgression({ ...progression, progressPct: 10 });
    await repos.progression.setConsideration('p1', 't1', consideration);

    await repos.runInTransaction(async (tx) => {
      tx.upsertPlayerProgression(progression);
      tx.appendProgressionEvent(executed);
    });

    const stored = await repos.progression.getPlayerProgression('p1', 't1');
    expect(stored).toEqual({ ...progression, consideration });
    expect(await repos.progression.listEvents('p1')).toEqual([executed]);
  });

  it('discards staged writes when the transaction throws', async () => {
    const repos = buildInMemoryRepositories();

    await expect(
      repos.runInTransaction(async (tx) => {
        tx.upsertPlayerProgression(progression);
        tx.appendProgressionEvent(executed);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');

    expect(await repos.progression.getPlayerProgression('p1', 't1')).toBeNull();
    expect(await repos.progression.listEvents('p1')).toEqual([]);
  });
});

describe('consideration tx methods', () => {
  beforeEach(() => {
    mockTransactWrite.mockReset();
  });

  interface ConditionalItem {
    Update: NonNullable<TransactItem['Update']> & { ConditionExpression: string };
  }

  const staged = (uow: DynamoUnitOfWork) => (uow as unknown as { staged: ConditionalItem[] }).staged;

  it('Dynamo: set without a seed requires the row and no consideration', () => {
    const uow = new DynamoUnitOfWork();
    uow.setProgressionConsideration('p1', 't1', consideration);
    const [{ Update: update }] = staged(uow);
    expect(update.UpdateExpression).toBe('SET #consideration = :consideration');
    expect(update.ConditionExpression).toBe('attribute_exists(#playerId) AND attribute_not_exists(#consideration)');
  });

  it('Dynamo: set with a seed creates the row without overwriting computed fields', () => {
    const uow = new DynamoUnitOfWork();
    uow.setProgressionConsideration('p1', 't1', consideration, {
      progressPct: 0,
      goals: [],
      computedAt: '2026-11-12T00:00:00.000Z',
    });
    const [{ Update: update }] = staged(uow);
    expect(update.UpdateExpression).toContain('#progressPct = if_not_exists(#progressPct, :progressPct)');
    expect(update.ConditionExpression).toBe('attribute_not_exists(#consideration)');
  });

  it('Dynamo: clear requires a consideration and maps a failed condition to ConcurrencyError', async () => {
    mockTransactWrite.mockRejectedValue({
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const uow = new DynamoUnitOfWork();
    uow.clearProgressionConsideration('p1', 't1');
    const [{ Update: update }] = staged(uow);
    expect(update.UpdateExpression).toBe('REMOVE #consideration');
    expect(update.ConditionExpression).toBe('attribute_exists(#consideration)');
    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('InMemory: guards set and clear the same way', async () => {
    const repos = buildInMemoryRepositories();
    await expect(repos.runInTransaction(async (tx) => {
      tx.setProgressionConsideration('p1', 't1', consideration);
    })).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(repos.runInTransaction(async (tx) => {
      tx.clearProgressionConsideration('p1', 't1');
    })).rejects.toBeInstanceOf(ConcurrencyError);

    await repos.runInTransaction(async (tx) => {
      tx.setProgressionConsideration('p1', 't1', consideration, progression);
    });
    expect(await repos.progression.getPlayerProgression('p1', 't1')).toEqual({ ...progression, consideration });

    await expect(repos.runInTransaction(async (tx) => {
      tx.setProgressionConsideration('p1', 't1', consideration, progression);
    })).rejects.toBeInstanceOf(ConcurrencyError);

    await repos.runInTransaction(async (tx) => {
      tx.clearProgressionConsideration('p1', 't1');
    });
    expect(await repos.progression.getPlayerProgression('p1', 't1')).toEqual(progression);
  });
});
