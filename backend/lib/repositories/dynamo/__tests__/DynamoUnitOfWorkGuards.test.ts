import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockTransactWrite } = vi.hoisted(() => ({ mockTransactWrite: vi.fn() }));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { transactWrite: mockTransactWrite },
  TableNames: {
    PLAYERS: 'Players',
    WRESTLERS: 'Wrestlers',
    SEASON_STANDINGS: 'SeasonStandings',
    MATCHES: 'Matches',
    MATCH_RATINGS: 'MatchRatings',
    DIVISIONS: 'Divisions',
  },
}));

import { DynamoUnitOfWork } from '../DynamoUnitOfWork';
import { ConcurrencyError } from '../../errors';
import { RatingAlreadyExistsError } from '../../matchRatings';

interface StagedUpdate {
  ConditionExpression?: string;
  UpdateExpression: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
}

function lastUpdate(uow: DynamoUnitOfWork): StagedUpdate {
  const items = (uow as unknown as { staged: Array<{ Update: StagedUpdate }> }).staged;
  return items[items.length - 1].Update;
}

function cancelled(codes: string[]): Error {
  const err = new Error('cancelled') as Error & { CancellationReasons: Array<{ Code: string }> };
  err.name = 'TransactionCanceledException';
  err.CancellationReasons = codes.map((Code) => ({ Code }));
  return err;
}

beforeEach(() => {
  mockTransactWrite.mockReset();
  mockTransactWrite.mockResolvedValue({});
});

describe('updatePlayer conditions', () => {
  it('stays unconditional when no condition is passed', () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p1', { name: 'A' });
    expect(lastUpdate(uow).ConditionExpression).toBeUndefined();
  });

  it('matches a stored version', () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p1', { name: 'A' }, { disciplineVersion: 4 });
    const update = lastUpdate(uow);
    expect(update.ConditionExpression).toBe('attribute_exists(playerId) AND #disciplineVersion = :expectedDisciplineVersion');
    expect(update.ExpressionAttributeNames?.['#disciplineVersion']).toBe('disciplineVersion');
    expect(update.ExpressionAttributeValues?.[':expectedDisciplineVersion']).toBe(4);
  });

  it('lets version 0 match a row that has no version yet', () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p1', { name: 'A' }, { disciplineVersion: 0 });
    expect(lastUpdate(uow).ConditionExpression).toBe(
      'attribute_exists(playerId) AND (attribute_not_exists(#disciplineVersion) OR #disciplineVersion = :expectedDisciplineVersion)',
    );
  });

  it('surfaces a failed condition as a ConcurrencyError', async () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p1', { name: 'A' }, { disciplineVersion: 4 });
    mockTransactWrite.mockRejectedValue(cancelled(['ConditionalCheckFailed']));
    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('requires the stored division when divisionId is given, even when the patch sets it', () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p1', { divisionId: 'd-raw' }, { divisionId: 'd-yb' });
    const update = lastUpdate(uow);
    expect(update.ConditionExpression).toBe('attribute_exists(playerId) AND #expectedDivisionId = :expectedDivisionId');
    expect(update.ExpressionAttributeNames?.['#expectedDivisionId']).toBe('divisionId');
    expect(update.ExpressionAttributeValues?.[':expectedDivisionId']).toBe('d-yb');
    expect(update.ExpressionAttributeValues?.[':v0']).toBe('d-raw');
  });

  it('combines a version and a division condition', () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p1', { name: 'A' }, { disciplineVersion: 2, divisionId: 'd-yb' });
    expect(lastUpdate(uow).ConditionExpression).toBe(
      'attribute_exists(playerId) AND #disciplineVersion = :expectedDisciplineVersion AND #expectedDivisionId = :expectedDivisionId',
    );
  });

  it('surfaces a failed division condition as a ConcurrencyError', async () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p1', { divisionId: 'd-raw' }, { divisionId: 'd-yb' });
    mockTransactWrite.mockRejectedValue(cancelled(['ConditionalCheckFailed']));
    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
  });
});

describe('updateChallenge conditions', () => {
  it('stays unconditional when no status is expected', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateChallenge('c1', { status: 'countered' });
    expect(lastUpdate(uow).ConditionExpression).toBeUndefined();
  });

  it('requires the expected status', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateChallenge('c1', { status: 'countered' }, 'pending');
    const update = lastUpdate(uow);
    expect(update.ConditionExpression).toBe('#s = :expectedStatus');
    expect(update.ExpressionAttributeNames?.['#s']).toBe('status');
    expect(update.ExpressionAttributeValues?.[':expectedStatus']).toBe('pending');
  });

  it('declares #s even when the patch does not set status', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateChallenge('c1', { message: 'x' }, 'pending');
    expect(lastUpdate(uow).ExpressionAttributeNames?.['#s']).toBe('status');
  });

  it('surfaces a failed condition as a ConcurrencyError', async () => {
    const uow = new DynamoUnitOfWork();
    uow.updateChallenge('c1', { status: 'countered' }, 'pending');
    mockTransactWrite.mockRejectedValue(cancelled(['ConditionalCheckFailed']));
    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
  });
});

describe('updateMatch conditions', () => {
  it('stays unconditional when no condition is passed', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateMatch('m1', 'd1', { isTitleDefense: true });
    expect(lastUpdate(uow).ConditionExpression).toBeUndefined();
  });

  it('notCompleted requires the row and a non-completed status', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateMatch('m1', 'd1', { status: 'completed', winners: ['p1'] }, { kind: 'notCompleted' });
    const update = lastUpdate(uow);
    expect(update.ConditionExpression).toBe('attribute_exists(matchId) AND #s <> :completedStatus');
    expect(update.ExpressionAttributeNames?.['#s']).toBe('status');
    expect(update.ExpressionAttributeValues?.[':completedStatus']).toBe('completed');
  });

  it('notCompleted declares #s even when the patch does not set status', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateMatch('m1', 'd1', { winners: ['p1'] }, { kind: 'notCompleted' });
    expect(lastUpdate(uow).ExpressionAttributeNames?.['#s']).toBe('status');
  });

  it('unchangedSince compares updatedAt through the name the update already declares', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateMatch('m1', 'd1', { slots: [] }, { kind: 'unchangedSince', updatedAt: 't0' });
    const update = lastUpdate(uow);
    expect(update.ConditionExpression).toBe('attribute_exists(matchId) AND #f1 = :expectedUpdatedAt');
    expect(update.ExpressionAttributeNames?.['#f1']).toBe('updatedAt');
    expect(update.ExpressionAttributeValues?.[':expectedUpdatedAt']).toBe('t0');
  });

  it('unchangedSince handles a legacy row with no updatedAt', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateMatch('m1', 'd1', { slots: [] }, { kind: 'unchangedSince', updatedAt: undefined });
    const update = lastUpdate(uow);
    expect(update.ConditionExpression).toBe('attribute_exists(matchId) AND attribute_not_exists(#f1)');
    expect(update.ExpressionAttributeValues).not.toHaveProperty(':expectedUpdatedAt');
  });
});

describe('ghost-row and ownership conditions', () => {
  it('incrementPlayerRecord requires a live player', () => {
    const uow = new DynamoUnitOfWork();
    uow.incrementPlayerRecord('p1', { wins: 1 });
    expect(lastUpdate(uow).ConditionExpression).toBe('attribute_exists(playerId) AND attribute_not_exists(deletedAt)');
  });

  it('incrementStanding stays unconditional because a first result creates the row', () => {
    const uow = new DynamoUnitOfWork();
    uow.incrementStanding('s1', 'p1', { wins: 1 });
    expect(lastUpdate(uow).ConditionExpression).toBeUndefined();
  });

  it('assignWrestlerToPlayer requires the wrestler to be free or already held by the player', () => {
    const uow = new DynamoUnitOfWork();
    uow.assignWrestlerToPlayer({ wrestlerId: 'w1', playerId: 'p1', slot: 'primary' });
    const update = lastUpdate(uow);
    expect(update.ConditionExpression).toBe(
      'attribute_exists(wrestlerId) AND (attribute_not_exists(isInUse) OR isInUse = :notInUse OR assignedPlayerId = :playerId)',
    );
    expect(update.ExpressionAttributeValues?.[':notInUse']).toBe('false');
    expect(update.ExpressionAttributeValues?.[':isInUse']).toBe('true');
  });

  it('releaseWrestlerFromPlayer only checks the owner when asked to', () => {
    const unguarded = new DynamoUnitOfWork();
    unguarded.releaseWrestlerFromPlayer({ wrestlerId: 'w1' });
    expect(lastUpdate(unguarded).ConditionExpression).toBe('attribute_exists(wrestlerId)');

    const guarded = new DynamoUnitOfWork();
    guarded.releaseWrestlerFromPlayer({ wrestlerId: 'w1', expectedPlayerId: 'p1' });
    const update = lastUpdate(guarded);
    expect(update.ConditionExpression).toBe('attribute_exists(wrestlerId) AND assignedPlayerId = :expectedPlayerId');
    expect(update.ExpressionAttributeValues?.[':expectedPlayerId']).toBe('p1');
  });
});

describe('updateDivision conditions', () => {
  it('always requires the row to exist', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateDivision('d1', { isDefaultForNewWrestlers: true, isDevelopmental: undefined });
    const update = lastUpdate(uow);
    expect(update.ConditionExpression).toBe('attribute_exists(divisionId)');
    // undefined fields are skipped, not written as null.
    expect(Object.values(update.ExpressionAttributeNames ?? {})).toEqual(['isDefaultForNewWrestlers', 'updatedAt']);
  });

  it('guards clearing the previous default on it still being the default', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateDivision('d1', { isDefaultForNewWrestlers: false }, { isDefaultForNewWrestlers: true });
    const update = lastUpdate(uow);
    expect(update.ConditionExpression).toBe('attribute_exists(divisionId) AND #isDefault = :expectedDefault');
    expect(update.ExpressionAttributeValues?.[':expectedDefault']).toBe(true);
  });

  it('surfaces a failed guard as a ConcurrencyError naming the division', async () => {
    mockTransactWrite.mockRejectedValue(cancelled(['ConditionalCheckFailed', 'None']));
    const uow = new DynamoUnitOfWork();
    uow.updateDivision('old', { isDefaultForNewWrestlers: false }, { isDefaultForNewWrestlers: true });
    uow.updateDivision('new', { isDefaultForNewWrestlers: true });
    await expect(uow.commit()).rejects.toThrow('Division with id old');
  });
});

describe('commit error mapping', () => {
  it('maps a failed match guard to ConcurrencyError', async () => {
    mockTransactWrite.mockRejectedValue(cancelled(['ConditionalCheckFailed', 'None']));
    const uow = new DynamoUnitOfWork();
    uow.updateMatch('m1', 'd1', { status: 'completed' }, { kind: 'notCompleted' });
    uow.incrementPlayerRecord('p1', { wins: 1 });
    await expect(uow.commit()).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('maps a guard failure at a later index to the right item', async () => {
    mockTransactWrite.mockRejectedValue(cancelled(['None', 'ConditionalCheckFailed']));
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p1', { name: 'x' });
    uow.assignWrestlerToPlayer({ wrestlerId: 'w1', playerId: 'p1', slot: 'primary' });
    await expect(uow.commit()).rejects.toThrow('Wrestler with id w1');
  });

  it('keeps rating duplicates typed when other items were staged first', async () => {
    mockTransactWrite.mockRejectedValue(cancelled(['None', 'ConditionalCheckFailed']));
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p1', { name: 'x' });
    uow.createMatchRating({ matchId: 'm1', userId: 'u1', rating: 4 });
    await expect(uow.commit()).rejects.toBeInstanceOf(RatingAlreadyExistsError);
  });

  it('rethrows an unguarded item failure unchanged', async () => {
    const err = cancelled(['ConditionalCheckFailed']);
    mockTransactWrite.mockRejectedValue(err);
    const uow = new DynamoUnitOfWork();
    uow.incrementPlayerRecord('p1', { wins: 1 });
    await expect(uow.commit()).rejects.toBe(err);
  });
});

describe('chunking warning', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  const stage = (uow: DynamoUnitOfWork, count: number) => {
    for (let i = 0; i < count; i++) uow.incrementPlayerRecord(`p${i}`, { wins: 1 });
  };

  it('warns once when the work spans more than one transaction', async () => {
    const uow = new DynamoUnitOfWork();
    stage(uow, 250);
    await uow.commit();
    expect(mockTransactWrite).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('250 items into 3 transactions');
  });

  it('stays quiet at exactly one full transaction', async () => {
    const uow = new DynamoUnitOfWork();
    stage(uow, 100);
    await uow.commit();
    expect(warn).not.toHaveBeenCalled();
  });
});
