import { describe, it, expect, vi } from 'vitest';

vi.mock('../../dynamodb', () => ({
  dynamoDb: { transactWrite: vi.fn() },
  TableNames: {
    CHAMPIONSHIPS: 'Championships',
    CHAMPIONSHIP_HISTORY: 'ChampionshipHistory',
  },
}));

import { DynamoUnitOfWork } from '../DynamoUnitOfWork';

type StagedView = Array<{
  Update?: {
    UpdateExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}>;

function staged(uow: DynamoUnitOfWork): StagedView {
  return (uow as unknown as { staged: StagedView }).staged;
}

describe('DynamoUnitOfWork championship tag team link (TTC-10)', () => {
  it('updateChampionship REMOVEs a null currentTagTeamId and SETs the rest', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateChampionship('c1', { currentChampion: ['p1', 'p2'], currentTagTeamId: null });

    const update = staged(uow)[0].Update!;
    const names = update.ExpressionAttributeNames ?? {};
    const removeMatch = update.UpdateExpression.match(/ REMOVE (.+)$/);
    expect(removeMatch).not.toBeNull();
    const removed = removeMatch![1].split(',').map((token) => names[token.trim()]);
    expect(removed).toEqual(['currentTagTeamId']);
    const values = Object.values(update.ExpressionAttributeValues ?? {});
    expect(values).not.toContain(null);
    expect(values).toContainEqual(['p1', 'p2']);
  });

  it('updateChampionship SETs a currentTagTeamId string', () => {
    const uow = new DynamoUnitOfWork();
    uow.updateChampionship('c1', { currentChampion: ['p1', 'p2'], currentTagTeamId: 'tt1' });

    const update = staged(uow)[0].Update!;
    expect(update.UpdateExpression).not.toContain('REMOVE');
    expect(Object.values(update.ExpressionAttributeValues ?? {})).toContain('tt1');
  });

  it('removeChampion also removes currentTagTeamId', () => {
    const uow = new DynamoUnitOfWork();
    uow.removeChampion('c1');
    expect(staged(uow)[0].Update!.UpdateExpression).toMatch(/^REMOVE currentChampion, currentTagTeamId /);
  });
});
