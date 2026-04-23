import { describe, it, expect, vi } from 'vitest';

// Mock TableNames and dynamoDb so the module imports cleanly without real AWS.
vi.mock('../../dynamodb', () => ({
  dynamoDb: { transactWrite: vi.fn() },
  TableNames: {
    PLAYERS: 'Players',
    WRESTLERS: 'Wrestlers',
    TAG_TEAMS: 'TagTeams',
    CHAMPIONSHIPS: 'Championships',
    CHAMPIONSHIP_HISTORY: 'ChampionshipHistory',
    CHALLENGES: 'Challenges',
    SEASON_STANDINGS: 'SeasonStandings',
    MATCHES: 'Matches',
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

describe('DynamoUnitOfWork.updatePlayer', () => {
  it('emits REMOVE for undefined/null fields and SET for concrete values', () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p-1', {
      name: 'Updated',
      currentWrestlerId: 'w-cena',
      currentWrestler: 'John Cena',
      alternateWrestlerId: null,
      alternateWrestler: undefined,
      divisionId: undefined,
      alignment: undefined,
    });

    const items = staged(uow);
    expect(items).toHaveLength(1);
    const update = items[0].Update!;

    // No ExpressionAttributeValue may be undefined — DynamoDB rejects those.
    for (const [token, value] of Object.entries(update.ExpressionAttributeValues ?? {})) {
      expect(value, `value for ${token} should not be undefined`).not.toBeUndefined();
    }

    // SET clause must include the concrete updates + updatedAt.
    expect(update.UpdateExpression).toMatch(/^SET /);
    expect(update.UpdateExpression).toContain('updatedAt');

    // REMOVE clause must cover every cleared field. Parse the REMOVE
    // portion of the expression, map its tokens back to field names.
    const removeMatch = update.UpdateExpression.match(/REMOVE (.+)$/);
    expect(removeMatch, 'expected a REMOVE clause').not.toBeNull();
    const removedTokens = removeMatch![1].split(',').map((s) => s.trim());
    const removedFieldNames = removedTokens.map(
      (t) => (update.ExpressionAttributeNames ?? {})[t],
    );
    expect(removedFieldNames).toEqual(
      expect.arrayContaining([
        'alternateWrestlerId',
        'alternateWrestler',
        'divisionId',
        'alignment',
      ]),
    );
  });

  it('omits the REMOVE clause entirely when every patch value is concrete', () => {
    const uow = new DynamoUnitOfWork();
    uow.updatePlayer('p-1', { name: 'Updated', currentWrestlerId: 'w-1' });

    const update = staged(uow)[0].Update!;
    expect(update.UpdateExpression).not.toContain('REMOVE');
    expect(update.UpdateExpression).toMatch(/^SET /);
  });
});
