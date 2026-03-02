import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { notFound, badRequest } from '../../lib/response';
import { handlerFactory } from '../../lib/handlers';

export const handler = handlerFactory({
  tableName: TableNames.PLAYERS,
  idField: 'playerId',
  entityName: 'player',
  requiredFields: ['name', 'currentWrestler'],
  optionalFields: ['imageUrl', 'divisionId', 'bio'],
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
    if (typeof body.bio === 'string' && body.bio.trim().length > 255) {
      return badRequest('Bio must be 255 characters or less');
    }
    return null;
  },
});
