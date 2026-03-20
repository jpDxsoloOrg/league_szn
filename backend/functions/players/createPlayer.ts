import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { notFound } from '../../lib/response';
import { handlerFactory } from '../../lib/handlers';

export const handler = handlerFactory({
  tableName: TableNames.PLAYERS,
  idField: 'playerId',
  entityName: 'player',
  requiredFields: ['name', 'currentWrestler'],
  optionalFields: ['imageUrl', 'divisionId', 'psnId'],
  defaults: {
    wins: 0,
    losses: 0,
    draws: 0,
  },
  validate: async (body, _event) => {
    if (body.divisionId) {
      const divisionResult = await dynamoDb.get({
        TableName: TableNames.DIVISIONS,
        Key: { divisionId: body.divisionId },
      });
      if (!divisionResult.Item) {
        return notFound(`Division ${body.divisionId} not found`);
      }
    }
    return null;
  },
});
