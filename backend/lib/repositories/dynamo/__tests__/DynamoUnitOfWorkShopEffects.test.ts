import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTransactWrite, mockGet } = vi.hoisted(() => ({
  mockTransactWrite: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { transactWrite: mockTransactWrite, get: mockGet },
  TableNames: {
    PLAYERS: 'Players',
    MATCHES: 'Matches',
    LEDGER: 'Ledger',
    LEDGER_IDEMPOTENCY: 'LedgerIdempotency',
  },
}));
vi.mock('uuid', () => ({ v4: () => 'entry-1' }));

import { DynamoUnitOfWork } from '../DynamoUnitOfWork';
import type { PlayerEffect } from '../../types';

interface UpdateItem {
  Update?: {
    TableName: string;
    UpdateExpression: string;
    ExpressionAttributeNames: Record<string, string>;
    ExpressionAttributeValues: Record<string, unknown>;
  };
}

const balanceUpdate = (): NonNullable<UpdateItem['Update']> => {
  const items = (mockTransactWrite.mock.calls[0][0] as { TransactItems: UpdateItem[] }).TransactItems;
  const update = items.find((item) => item.Update?.TableName === 'Players')?.Update;
  if (!update) throw new Error('no player update');
  return update;
};

const shield: PlayerEffect = {
  effectId: 'e1',
  purchasedAt: '2026-11-24T00:00:00.000Z',
  purchaseKey: 'shop#injuryShield#p1#r1',
  kind: 'injuryShield',
  reduction: 0.5,
  matchesLeft: 3,
};

beforeEach(() => {
  mockTransactWrite.mockReset();
  mockTransactWrite.mockResolvedValue({});
  mockGet.mockReset();
  mockGet.mockResolvedValue({ Item: { playerId: 'p1', balance: 400 } });
});

// ECO-08
describe('DynamoUnitOfWork.postLedgerEntry with appendPlayerEffects', () => {
  it('appends the effects in the same guarded balance write', async () => {
    const uow = new DynamoUnitOfWork();
    uow.postLedgerEntry({
      playerId: 'p1',
      kind: 'purchase',
      amount: -300,
      idempotencyKey: shield.purchaseKey,
      appendPlayerEffects: [shield],
    });
    await uow.commit();

    const update = balanceUpdate();
    expect(update.UpdateExpression).toContain('#effects = list_append(if_not_exists(#effects, :noEffects), :effects)');
    expect(update.ExpressionAttributeNames['#effects']).toBe('effects');
    expect(update.ExpressionAttributeValues[':effects']).toEqual([shield]);
    expect(update.ExpressionAttributeValues[':noEffects']).toEqual([]);
  });

  it('leaves effects alone for a plain posting', async () => {
    const uow = new DynamoUnitOfWork();
    uow.postLedgerEntry({ playerId: 'p1', kind: 'gmAdjust', amount: 10, idempotencyKey: 'k' });
    await uow.commit();

    const update = balanceUpdate();
    expect(update.UpdateExpression).not.toContain('#effects');
    expect(update.ExpressionAttributeNames['#effects']).toBeUndefined();
  });

  it('does not store the effects on the ledger entry', async () => {
    const uow = new DynamoUnitOfWork();
    uow.postLedgerEntry({
      playerId: 'p1',
      kind: 'purchase',
      amount: -300,
      idempotencyKey: shield.purchaseKey,
      appendPlayerEffects: [shield],
    });
    await uow.commit();

    const items = (mockTransactWrite.mock.calls[0][0] as {
      TransactItems: Array<{ Put?: { TableName: string; Item: Record<string, unknown> } }>;
    }).TransactItems;
    const entry = items.find((item) => item.Put?.TableName === 'Ledger')?.Put?.Item;
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty('appendPlayerEffects');
  });
});
