import { deleteHandlerFactory } from '../../lib/handlers';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { ConflictError } from '../../lib/repositories/errors';
import { getRepositories } from '../../lib/repositories';
import type { Division } from '../../lib/repositories/types';

export const handler = deleteHandlerFactory<Division>({
  repo: () => getRepositories().divisions,
  entityName: 'division',
  idParam: 'divisionId',
  preDelete: async (divisionId) => {
    const playersResult = await dynamoDb.scan({
      TableName: TableNames.PLAYERS,
      FilterExpression: '#divisionId = :divisionId',
      ExpressionAttributeNames: { '#divisionId': 'divisionId' },
      ExpressionAttributeValues: { ':divisionId': divisionId },
    });
    const count = playersResult.Items?.length ?? 0;
    if (count > 0) {
      throw new ConflictError(
        `Cannot delete division. ${count} player(s) are still assigned to this division.`,
      );
    }
  },
});
