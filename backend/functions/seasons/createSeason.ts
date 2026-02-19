import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { conflict } from '../../lib/response';
import { handlerFactory } from '../../lib/handlers';

export const handler = handlerFactory({
  tableName: TableNames.SEASONS,
  idField: 'seasonId',
  entityName: 'season',
  requiredFields: ['name', 'startDate'],
  nullableFields: ['endDate'],
  defaults: { status: 'active' },
  validate: async (_body, _event) => {
    const existingSeasons = await dynamoDb.scan({
      TableName: TableNames.SEASONS,
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':active': 'active' },
    });
    if (existingSeasons.Items && existingSeasons.Items.length > 0) {
      return conflict('There is already an active season. Please end the current season before creating a new one.');
    }
    return null;
  },
});