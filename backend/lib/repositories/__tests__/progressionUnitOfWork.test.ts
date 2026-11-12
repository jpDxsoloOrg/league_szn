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
