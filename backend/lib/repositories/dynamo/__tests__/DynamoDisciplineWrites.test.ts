import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { update: mockUpdate },
  TableNames: { CHALLENGES: 'Challenges', PLAYERS: 'Players' },
}));

import { DynamoRosterRepository } from '../DynamoRosterRepository';
import { DynamoUserRepository } from '../DynamoUserRepository';
import { ConcurrencyError } from '../../errors';

const conditionFailed = () => Object.assign(new Error('failed'), { name: 'ConditionalCheckFailedException' });

interface CapturedUpdate {
  Key: Record<string, string>;
  UpdateExpression: string;
  ConditionExpression: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
}

const lastUpdate = (): CapturedUpdate => mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1][0] as CapturedUpdate;

describe('DynamoRosterRepository players.updateDiscipline', () => {
  const { players } = new DynamoRosterRepository();
  const patch = { strikes: [], deactivations: [], deactivatedAt: null };

  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ Attributes: { playerId: 'p1', disciplineVersion: 1 } });
  });

  it('accepts an absent version only for expected version 0', async () => {
    await players.updateDiscipline('p1', patch, 0);

    expect(lastUpdate().ConditionExpression).toBe(
      'attribute_exists(playerId) AND attribute_not_exists(deletedAt) AND (attribute_not_exists(disciplineVersion) OR disciplineVersion = :expected)',
    );
    expect(lastUpdate().ExpressionAttributeValues).toMatchObject({ ':expected': 0, ':nextVersion': 1 });
  });

  it('requires the exact version otherwise', async () => {
    await players.updateDiscipline('p1', patch, 4);

    expect(lastUpdate().ConditionExpression).toBe(
      'attribute_exists(playerId) AND attribute_not_exists(deletedAt) AND disciplineVersion = :expected',
    );
    expect(lastUpdate().ExpressionAttributeValues).toMatchObject({ ':expected': 4, ':nextVersion': 5 });
  });

  it('removes deactivatedAt on null', async () => {
    await players.updateDiscipline('p1', patch, 0);

    expect(lastUpdate().UpdateExpression).toContain(' REMOVE deactivatedAt');
    expect(lastUpdate().ExpressionAttributeValues).not.toHaveProperty(':deactivatedAt');
  });

  it('sets deactivatedAt when given one', async () => {
    await players.updateDiscipline('p1', { ...patch, deactivatedAt: '2026-01-01T00:00:00.000Z' }, 0);

    expect(lastUpdate().UpdateExpression).not.toContain('REMOVE');
    expect(lastUpdate().ExpressionAttributeValues[':deactivatedAt']).toBe('2026-01-01T00:00:00.000Z');
  });

  it('leaves signupGuardKey alone when omitted and writes it when given', async () => {
    await players.updateDiscipline('p1', patch, 0);
    expect(lastUpdate().UpdateExpression).not.toContain('signupGuardKey');

    await players.updateDiscipline('p1', { ...patch, signupGuardKey: 'a@b.c' }, 0);
    expect(lastUpdate().ExpressionAttributeValues[':signupGuardKey']).toBe('a@b.c');
  });

  it('returns the new row', async () => {
    expect(await players.updateDiscipline('p1', patch, 0)).toEqual({ playerId: 'p1', disciplineVersion: 1 });
  });

  it('turns a failed condition into ConcurrencyError', async () => {
    mockUpdate.mockRejectedValue(conditionFailed());

    await expect(players.updateDiscipline('p1', patch, 0)).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('lets other errors through', async () => {
    mockUpdate.mockRejectedValue(new Error('throttled'));

    await expect(players.updateDiscipline('p1', patch, 0)).rejects.toThrow('throttled');
  });
});

describe('DynamoUserRepository challenges.updateIfStatus', () => {
  const { challenges } = new DynamoUserRepository();

  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  it('writes on condition that the status still matches', async () => {
    expect(await challenges.updateIfStatus('c1', { status: 'cancelled' }, 'countered')).toBe(true);

    const update = lastUpdate();
    expect(update.Key).toEqual({ challengeId: 'c1' });
    expect(update.ConditionExpression).toBe('#expectedStatusField = :expectedStatus');
    expect(update.ExpressionAttributeNames).toMatchObject({ '#status': 'status', '#expectedStatusField': 'status' });
    expect(update.ExpressionAttributeValues).toMatchObject({ ':status': 'cancelled', ':expectedStatus': 'countered' });
  });

  it('resolves false when the status moved on', async () => {
    mockUpdate.mockRejectedValue(conditionFailed());

    expect(await challenges.updateIfStatus('c1', { status: 'cancelled' }, 'pending')).toBe(false);
  });

  it('lets other errors through', async () => {
    mockUpdate.mockRejectedValue(new Error('throttled'));

    await expect(challenges.updateIfStatus('c1', { status: 'cancelled' }, 'pending')).rejects.toThrow('throttled');
  });
});
