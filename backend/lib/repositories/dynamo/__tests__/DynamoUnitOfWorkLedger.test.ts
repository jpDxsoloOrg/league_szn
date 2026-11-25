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
import { ConcurrencyError, NotFoundError } from '../../errors';
import { DuplicatePostingError, InvalidLedgerPostingError } from '../../ledger';

interface TransactItem {
  Put?: { TableName: string; Item: Record<string, unknown>; ConditionExpression?: string };
  Update?: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ConditionExpression?: string;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

function cancelled(codes: string[]): Error {
  const err = new Error('cancelled') as Error & { CancellationReasons: Array<{ Code: string }> };
  err.name = 'TransactionCanceledException';
  err.CancellationReasons = codes.map((Code) => ({ Code }));
  return err;
}

const sentItems = (): TransactItem[] =>
  (mockTransactWrite.mock.calls[0][0] as { TransactItems: TransactItem[] }).TransactItems;

beforeEach(() => {
  mockTransactWrite.mockReset();
  mockTransactWrite.mockResolvedValue({});
  mockGet.mockReset();
  mockGet.mockResolvedValue({ Item: { playerId: 'p1', balance: 40 } });
});

describe('DynamoUnitOfWork.postLedgerEntry', () => {
  it('writes the idempotency row, the entry and a guarded balance update first in the transaction', async () => {
    const uow = new DynamoUnitOfWork();
    uow.updateMatch('m1', '2026-01-01', { status: 'completed' });
    const staged = uow.postLedgerEntry({
      playerId: 'p1',
      kind: 'perMatchPay',
      amount: 25,
      idempotencyKey: 'match#m1#pay#p1',
      ref: { type: 'match', id: 'm1' },
    });
    await uow.commit();

    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({ ConsistentRead: true, Key: { playerId: 'p1' } }));
    const items = sentItems();
    expect(items).toHaveLength(4);
    expect(items[0].Put).toMatchObject({
      TableName: 'LedgerIdempotency',
      Item: { idempotencyKey: 'match#m1#pay#p1', playerId: 'p1', entryId: 'entry-1', sortKey: staged.sortKey },
      ConditionExpression: 'attribute_not_exists(idempotencyKey)',
    });
    expect(items[1].Put).toMatchObject({
      TableName: 'Ledger',
      Item: {
        playerId: 'p1',
        sortKey: staged.sortKey,
        kind: 'perMatchPay',
        amount: 25,
        balanceAfter: 65,
        refType: 'match',
        refId: 'm1',
      },
    });
    expect(items[2].Update?.TableName).toBe('Players');
    expect(items[2].Update?.ConditionExpression).toContain('#balance = :expectedBalance');
    expect(items[2].Update?.ExpressionAttributeValues).toMatchObject({ ':delta': 25, ':expectedBalance': 40 });
    expect(items[3].Update?.TableName).toBe('Matches');
  });

  it('guards a missing balance with attribute_not_exists and counts it as 0', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1' } });
    const uow = new DynamoUnitOfWork();
    uow.postLedgerEntry({ playerId: 'p1', kind: 'fine', amount: -10, idempotencyKey: 'fine' });
    await uow.commit();
    const items = sentItems();
    expect(items[1].Put?.Item.balanceAfter).toBe(-10);
    expect(items[2].Update?.ConditionExpression).toContain('attribute_not_exists(#balance)');
  });

  it('maps a failed idempotency condition to DuplicatePostingError', async () => {
    mockTransactWrite.mockRejectedValue(cancelled(['ConditionalCheckFailed', 'None', 'None']));
    const uow = new DynamoUnitOfWork();
    uow.postLedgerEntry({ playerId: 'p1', kind: 'salary', amount: 5, idempotencyKey: 'dup' });
    await expect(uow.commit()).rejects.toEqual(new DuplicatePostingError('dup'));
  });

  it('maps a moved balance to ConcurrencyError', async () => {
    mockTransactWrite.mockRejectedValue(cancelled(['None', 'None', 'ConditionalCheckFailed']));
    const uow = new DynamoUnitOfWork();
    uow.postLedgerEntry({ playerId: 'p1', kind: 'salary', amount: 5, idempotencyKey: 'k' });
    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('refuses a missing or deleted player before writing', async () => {
    mockGet.mockResolvedValue({ Item: { playerId: 'p1', deletedAt: '2026-01-01' } });
    const uow = new DynamoUnitOfWork();
    uow.postLedgerEntry({ playerId: 'p1', kind: 'salary', amount: 5, idempotencyKey: 'k' });
    await expect(uow.commit()).rejects.toBeInstanceOf(NotFoundError);
    expect(mockTransactWrite).not.toHaveBeenCalled();
  });

  it('refuses a posting for a player the unit of work also writes', async () => {
    const uow = new DynamoUnitOfWork();
    uow.incrementPlayerRecord('p1', { wins: 1 });
    uow.postLedgerEntry({ playerId: 'p1', kind: 'winBonus', amount: 5, idempotencyKey: 'k' });
    await expect(uow.commit()).rejects.toBeInstanceOf(InvalidLedgerPostingError);
    expect(mockTransactWrite).not.toHaveBeenCalled();
  });
});
