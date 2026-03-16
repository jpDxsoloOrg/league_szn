import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { notFound } from '../../lib/response';
import { handlerFactory } from '../../lib/handlers';

export const handler = handlerFactory({
  tableName: TableNames.SHOWS,
  idField: 'showId',
  entityName: 'show',
  requiredFields: ['name', 'companyId'],
  optionalFields: ['description', 'schedule'],
  validate: async (body) => {
    if (body.companyId) {
      const companyResult = await dynamoDb.get({
        TableName: TableNames.COMPANIES,
        Key: { companyId: body.companyId },
      });
      if (!companyResult.Item) {
        return notFound(`Company ${body.companyId} not found`);
      }
    }
    return null;
  },
});
