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
    INJURIES: 'Injuries',
  },
}));

import { DynamoUnitOfWork } from '../DynamoUnitOfWork';
import { ConcurrencyError } from '../../errors';
import { InvalidLedgerPostingError } from '../../ledger';
import { InvalidInjuryWriteError, type CurrentInjury, type Injury } from '../../injuries';

interface TransactItem {
  Put?: { TableName: string; Item: Record<string, unknown>; ConditionExpression?: string };
  Update?: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

const transactItems = (): TransactItem[] =>
  (mockTransactWrite.mock.calls[0][0] as { TransactItems: TransactItem[] }).TransactItems;

const injury: Injury = {
  playerId: 'p1',
  startedAt: '2026-11-24T20:00:00.000Z',
  injuryId: 'inj-1',
  source: 'match',
  severity: 'moderate',
  weeks: 2,
  returnsAt: '2026-12-06T05:00:00.000Z',
  matchId: 'm1',
  changes: [],
};

const current: CurrentInjury = {
  injuryId: 'inj-1',
  startedAt: injury.startedAt,
  returnsAt: injury.returnsAt,
  severity: 'moderate',
  weeks: 2,
  matchId: 'm1',
  source: 'match',
};

beforeEach(() => {
  mockTransactWrite.mockReset();
  mockTransactWrite.mockResolvedValue({});
  mockGet.mockReset();
  mockGet.mockResolvedValue({ Item: { playerId: 'p1', balance: 0 } });
});

// INJ-03
describe('DynamoUnitOfWork stamina and injuries', () => {
  it('merges the condition into the record increment for the same player', async () => {
    const uow = new DynamoUnitOfWork();
    uow.incrementPlayerRecord('p1', { wins: 1 });
    uow.updatePlayerCondition('p1', { stamina: 70, currentInjury: current });
    uow.putInjury(injury);
    await uow.commit();

    const items = transactItems();
    expect(items).toHaveLength(2);
    const playerWrite = items.find((item) => item.Update?.TableName === 'Players')!.Update!;
    expect(playerWrite.UpdateExpression).toBe(
      'SET wins = if_not_exists(wins, :zero) + :dw, updatedAt = :timestamp, #condStamina = :condStamina, #condInjury = :condInjury',
    );
    expect(playerWrite.ExpressionAttributeNames).toEqual({ '#condStamina': 'stamina', '#condInjury': 'currentInjury' });
    expect(playerWrite.ExpressionAttributeValues).toMatchObject({ ':dw': 1, ':condStamina': 70, ':condInjury': current });
    expect(playerWrite.ConditionExpression).toBe('attribute_exists(playerId) AND attribute_not_exists(deletedAt)');

    const injuryPut = items.find((item) => item.Put)!.Put!;
    expect(injuryPut).toMatchObject({ TableName: 'Injuries', ConditionExpression: 'attribute_not_exists(playerId)' });
    expect(injuryPut.Item).toEqual(injury);
  });

  it('merges a cleared injury as a REMOVE after the increment SET', async () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayerCondition('p1', { currentInjury: null });
    uow.incrementPlayerRecord('p1', { losses: 1 });
    await uow.commit();

    const update = transactItems()[0].Update!;
    expect(update.UpdateExpression).toBe(
      'SET losses = if_not_exists(losses, :zero) + :dl, updatedAt = :timestamp REMOVE #condInjury',
    );
    expect(update.ExpressionAttributeNames).toEqual({ '#condInjury': 'currentInjury' });
  });

  it('writes a condition on its own when there is no increment, refusing a missing or deleted player', async () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayerCondition('p1', { stamina: 100, currentInjury: null });
    await uow.commit();

    const update = transactItems()[0].Update!;
    expect(update).toMatchObject({ TableName: 'Players', Key: { playerId: 'p1' } });
    expect(update.UpdateExpression).toBe('SET #condStamina = :condStamina, #condUpdatedAt = :condUpdatedAt REMOVE #condInjury');
    expect(update.ConditionExpression).toBe('attribute_exists(#condPlayerId) AND attribute_not_exists(#condDeletedAt)');
  });

  it('adds the guard to the condition and maps its failure to ConcurrencyError', async () => {
    mockTransactWrite.mockRejectedValue({
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const uow = new DynamoUnitOfWork();
    uow.updatePlayerCondition('p1', { stamina: 55 }, { stamina: 80, currentInjuryId: 'inj-1' });

    await expect(uow.commit()).rejects.toThrow(ConcurrencyError);
    const update = transactItems()[0].Update!;
    expect(update.ConditionExpression).toBe(
      'attribute_exists(#condPlayerId) AND attribute_not_exists(#condDeletedAt)'
        + ' AND #condStamina = :condExpectedStamina AND #condInjury.#condInjuryId = :condExpectedInjuryId',
    );
    expect(update.ExpressionAttributeValues).toMatchObject({ ':condExpectedStamina': 80, ':condExpectedInjuryId': 'inj-1' });
  });

  it('guards on absent values with attribute_not_exists, also when merged', async () => {
    mockTransactWrite.mockRejectedValue({
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const uow = new DynamoUnitOfWork();
    uow.incrementPlayerRecord('p1', { draws: 1 });
    uow.updatePlayerCondition('p1', { currentInjury: current }, { stamina: null, currentInjuryId: null });

    await expect(uow.commit()).rejects.toThrow(new ConcurrencyError('Player', 'p1'));
    expect(transactItems()[0].Update!.ConditionExpression).toBe(
      'attribute_exists(playerId) AND attribute_not_exists(deletedAt)'
        + ' AND attribute_not_exists(#condStamina) AND attribute_not_exists(#condInjury)',
    );
  });

  it('refuses a condition write next to another write to the same player', async () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p1', { name: 'New name' });
    uow.updatePlayerCondition('p1', { stamina: 10 });
    await expect(uow.commit()).rejects.toThrow(InvalidInjuryWriteError);
    expect(mockTransactWrite).not.toHaveBeenCalled();
  });

  it('refuses a condition write next to a ledger posting for the same player', async () => {
    const uow = new DynamoUnitOfWork();
    uow.postLedgerEntry({ playerId: 'p1', kind: 'perMatchPay', amount: 100, idempotencyKey: 'matchPay#m1#p1' });
    uow.updatePlayerCondition('p1', { stamina: 10 });
    await expect(uow.commit()).rejects.toThrow(InvalidLedgerPostingError);
    expect(mockTransactWrite).not.toHaveBeenCalled();
  });

  it('refuses a second condition write and an invalid patch while staging', () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayerCondition('p1', { stamina: 10 });
    expect(() => uow.updatePlayerCondition('p1', { stamina: 5 })).toThrow(InvalidInjuryWriteError);
    expect(() => uow.updatePlayerCondition('p2', {})).toThrow(InvalidInjuryWriteError);
    expect(() => uow.updatePlayerCondition('p2', { stamina: -1 })).toThrow(InvalidInjuryWriteError);
  });

  it('updates an open injury and appends to its change log', async () => {
    const uow = new DynamoUnitOfWork();
    uow.updateInjury('p1', injury.startedAt, {
      returnsAt: '2026-12-13T05:00:00.000Z',
      weeks: 3,
      appendChanges: [{ kind: 'extended', at: '2026-11-25T00:00:00.000Z', by: 'gm-sub', note: 'Worse than thought' }],
    });
    await uow.commit();

    const update = transactItems()[0].Update!;
    expect(update).toMatchObject({ TableName: 'Injuries', Key: { playerId: 'p1', startedAt: injury.startedAt } });
    expect(update.UpdateExpression).toBe(
      'SET #returnsAt = :returnsAt, #weeks = :weeks, #changes = list_append(if_not_exists(#changes, :noChanges), :appendChanges)',
    );
    expect(update.ConditionExpression).toBe('attribute_exists(#playerId) AND attribute_not_exists(#endedAt)');
  });

  it('maps a failed injury guard (missing or already ended) to ConcurrencyError', async () => {
    mockTransactWrite.mockRejectedValue({
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const uow = new DynamoUnitOfWork();
    uow.updateInjury('p1', injury.startedAt, { endedAt: '2026-11-30T05:00:00.000Z', endedReason: 'recovered' });
    await expect(uow.commit()).rejects.toThrow(new ConcurrencyError('Injury', `p1/${injury.startedAt}`));
  });

  it('refuses an empty injury patch and an end without a reason', () => {
    const uow = new DynamoUnitOfWork();
    expect(() => uow.updateInjury('p1', injury.startedAt, {})).toThrow(InvalidInjuryWriteError);
    expect(() => uow.updateInjury('p1', injury.startedAt, { endedAt: '2026-11-30T05:00:00.000Z' }))
      .toThrow(InvalidInjuryWriteError);
    expect(() => uow.putInjury({ ...injury, weeks: 1.5 })).toThrow(InvalidInjuryWriteError);
  });
});
