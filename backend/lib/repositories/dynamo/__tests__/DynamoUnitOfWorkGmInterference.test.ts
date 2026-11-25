import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTransactWrite, mockGet } = vi.hoisted(() => ({
  mockTransactWrite: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { transactWrite: mockTransactWrite, get: mockGet },
  TableNames: {
    PLAYERS: 'Players',
    LEDGER: 'Ledger',
    LEDGER_IDEMPOTENCY: 'LedgerIdempotency',
    GM_INTERFERENCE: 'GmInterference',
  },
}));
vi.mock('uuid', () => ({ v4: () => 'entry-1' }));

import { DynamoUnitOfWork } from '../DynamoUnitOfWork';
import { ConcurrencyError } from '../../errors';
import type { GmInterferenceRequest } from '../../gmInterference';

interface TransactItem {
  Put?: { TableName: string; Item: Record<string, unknown>; ConditionExpression?: string };
  Update?: {
    TableName: string;
    UpdateExpression: string;
    ConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
  };
}

const transactItems = (): TransactItem[] =>
  (mockTransactWrite.mock.calls[0][0] as { TransactItems: TransactItem[] }).TransactItems;

const request: GmInterferenceRequest = {
  requestId: 'req-1',
  playerId: 'p1',
  request: 'Title shot please',
  status: 'pending',
  price: 1000,
  sequence: 1,
  chargeEntryId: 'entry-1',
  chargeKey: 'gmInterference#p1#1',
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
};

beforeEach(() => {
  mockTransactWrite.mockReset();
  mockTransactWrite.mockResolvedValue({});
  mockGet.mockReset();
  mockGet.mockResolvedValue({ Item: { playerId: 'p1', balance: 5000 } });
});

// ECO-09
describe('DynamoUnitOfWork GM interference', () => {
  it('writes the request in the same transaction as its charge, guarded on a new id', async () => {
    const uow = new DynamoUnitOfWork();
    uow.postLedgerEntry({ playerId: 'p1', kind: 'purchase', amount: -1000, idempotencyKey: request.chargeKey });
    uow.createGmInterferenceRequest(request);
    await uow.commit();

    expect(mockTransactWrite).toHaveBeenCalledTimes(1);
    const put = transactItems().find((item) => item.Put?.TableName === 'GmInterference')?.Put;
    expect(put?.Item).toEqual(request);
    expect(put?.ConditionExpression).toBe('attribute_not_exists(requestId)');
    expect(transactItems().some((item) => item.Put?.TableName === 'LedgerIdempotency')).toBe(true);
  });

  it('resolves only while the row is still pending', async () => {
    const uow = new DynamoUnitOfWork();
    uow.resolveGmInterferenceRequest('req-1', {
      status: 'taken',
      resolvedAt: '2026-11-25T00:00:00.000Z',
      resolvedBy: 'gm-1',
      privateNote: 'no',
    });
    await uow.commit();

    const update = transactItems()[0].Update;
    expect(update?.ConditionExpression).toBe('attribute_exists(#requestId) AND #status = :pending');
    expect(update?.UpdateExpression).toContain('#privateNote = :privateNote');
    expect(update?.UpdateExpression).not.toContain('publicNote');
    expect(update?.ExpressionAttributeValues).toMatchObject({ ':status': 'taken', ':pending': 'pending' });
  });

  it('maps a failed pending guard to ConcurrencyError', async () => {
    mockTransactWrite.mockRejectedValue({
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const uow = new DynamoUnitOfWork();
    uow.resolveGmInterferenceRequest('req-1', { status: 'delivered', resolvedAt: 'now', resolvedBy: 'gm-1' });
    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
  });
});
