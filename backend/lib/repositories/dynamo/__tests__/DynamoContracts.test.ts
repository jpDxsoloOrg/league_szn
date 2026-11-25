import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTransactWrite, mockUpdate, mockGet } = vi.hoisted(() => ({
  mockTransactWrite: vi.fn(),
  mockUpdate: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { transactWrite: mockTransactWrite, update: mockUpdate, get: mockGet },
  TableNames: { PLAYERS: 'Players', CONTRACTS: 'Contracts' },
}));

import { DynamoUnitOfWork } from '../DynamoUnitOfWork';
import { DynamoContractsRepository } from '../DynamoContractsRepository';
import { buildContractUpdate } from '../contractRows';
import { ConcurrencyError, NotFoundError } from '../../errors';

interface StagedItem {
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

const stagedOf = (uow: DynamoUnitOfWork): StagedItem[] =>
  (uow as unknown as { staged: StagedItem[] }).staged;

function cancelledAt(index: number, total: number): Error {
  const err = new Error('cancelled') as Error & { CancellationReasons: Array<{ Code: string }> };
  err.name = 'TransactionCanceledException';
  err.CancellationReasons = Array.from({ length: total }, (_, i) => ({ Code: i === index ? 'ConditionalCheckFailed' : 'None' }));
  return err;
}

beforeEach(() => {
  mockTransactWrite.mockReset();
  mockTransactWrite.mockResolvedValue({});
  mockUpdate.mockReset();
  mockGet.mockReset();
});

describe('buildContractUpdate', () => {
  it('sets values, removes nulls and guards existence plus status', () => {
    const parts = buildContractUpdate({ status: 'active', note: null, startedAt: 't1' }, 'now', 'offered');
    expect(parts.UpdateExpression).toBe('SET #updatedAt = :updatedAt, #p0 = :p0, #p2 = :p2 REMOVE #p1');
    expect(parts.ExpressionAttributeNames).toMatchObject({ '#p0': 'status', '#p1': 'note', '#p2': 'startedAt' });
    expect(parts.ConditionExpression).toBe('attribute_exists(#contractId) AND #expectedStatus = :expectedStatus');
    expect(parts.ExpressionAttributeValues[':expectedStatus']).toBe('offered');
  });

  it('only guards existence without an expected status', () => {
    expect(buildContractUpdate({ matchesPlayed: 2 }, 'now').ConditionExpression).toBe('attribute_exists(#contractId)');
  });
});

describe('DynamoUnitOfWork contract operations', () => {
  it('stages an accept: guarded contract update and conditional player link', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateContract('c1', { status: 'active' }, 'offered');
    uow.setPlayerActiveContract('p1', 'c1');
    const [contractUpdate, playerUpdate] = stagedOf(uow);

    expect(contractUpdate.Update?.TableName).toBe('Contracts');
    expect(contractUpdate.Update?.Key).toEqual({ contractId: 'c1' });
    expect(playerUpdate.Update?.TableName).toBe('Players');
    expect(playerUpdate.Update?.ConditionExpression)
      .toBe('attribute_exists(#playerId) AND attribute_not_exists(#activeContractId)');
    expect(playerUpdate.Update?.ExpressionAttributeValues?.[':contractId']).toBe('c1');
  });

  it('clears the link only when it still names the contract', () => {
    const uow = new DynamoUnitOfWork();
    uow.clearPlayerActiveContract('p1', 'c1');
    const [update] = stagedOf(uow);
    expect(update.Update?.UpdateExpression).toBe('REMOVE #activeContractId SET #updatedAt = :updatedAt');
    expect(update.Update?.ConditionExpression).toBe('#activeContractId = :expectedContractId');
  });

  it('creates a contract only when the id is new', () => {
    const uow = new DynamoUnitOfWork();
    uow.createContract({
      contractId: 'c1', playerId: 'p1', type: 'tryout', status: 'offered', matchesTotal: 3, matchesPlayed: 0,
      perMatchPay: 1, weeklySalary: 0, winBonus: 0, offeredBy: 'gm', offeredAt: 't0',
      offerExpiresAt: 't1', createdAt: 't0', updatedAt: 't0',
    });
    expect(stagedOf(uow)[0].Put?.ConditionExpression).toBe('attribute_not_exists(contractId)');
  });

  it('maps a player already under contract to ConcurrencyError', async () => {
    mockTransactWrite.mockRejectedValue(cancelledAt(1, 2));
    const uow = new DynamoUnitOfWork();
    uow.updateContract('c1', { status: 'active' }, 'offered');
    uow.setPlayerActiveContract('p1', 'c1');
    await expect(uow.commit()).rejects.toMatchObject({
      name: 'ConcurrencyError',
      message: expect.stringContaining('Player with id p1'),
    });
  });
});

describe('DynamoContractsRepository.update', () => {
  const conditionalFailure = (): Error => {
    const err = new Error('failed');
    err.name = 'ConditionalCheckFailedException';
    return err;
  };

  it('returns the updated row', async () => {
    mockUpdate.mockResolvedValue({ Attributes: { contractId: 'c1', status: 'active' } });
    const repo = new DynamoContractsRepository();
    expect(await repo.update('c1', { status: 'active' }, 'offered')).toEqual({ contractId: 'c1', status: 'active' });
  });

  it('throws NotFoundError for a missing row and ConcurrencyError for a status change', async () => {
    mockUpdate.mockRejectedValue(conditionalFailure());
    const repo = new DynamoContractsRepository();

    mockGet.mockResolvedValueOnce({});
    await expect(repo.update('c1', { status: 'active' }, 'offered')).rejects.toBeInstanceOf(NotFoundError);

    mockGet.mockResolvedValueOnce({ Item: { contractId: 'c1', status: 'declined' } });
    await expect(repo.update('c1', { status: 'active' }, 'offered')).rejects.toBeInstanceOf(ConcurrencyError);
  });
});
