import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { handlerFactory } from '../../lib/handlers';
import { badRequest, notFound } from '../../lib/response';

export const handler = handlerFactory({
  tableName: TableNames.EVENTS,
  idField: 'eventId',
  entityName: 'event',
  requiredFields: ['name', 'eventType', 'date'],
  optionalFields: ['companyIds', 'showId', 'seasonId'],
  nullableFields: ['venue', 'description', 'imageUrl', 'themeColor', 'fantasyBudget', 'fantasyPicksPerDivision'],
  defaults: { status: 'upcoming', matchCards: [], attendance: null, rating: null, fantasyEnabled: true },
  validate: async (body, _event) => {
    if (body.eventType !== 'ppv' && body.eventType !== 'weekly' && body.eventType !== 'special' && body.eventType !== 'house') {
      return badRequest('eventType must be one of ppv, weekly, special, or house');
    }
    if (body.companyIds) {
      if (!Array.isArray(body.companyIds)) {
        return badRequest('companyIds must be an array of company IDs');
      }
      for (const companyId of body.companyIds as string[]) {
        const companyResult = await dynamoDb.get({
          TableName: TableNames.COMPANIES,
          Key: { companyId },
        });
        if (!companyResult.Item) {
          return notFound(`Company ${companyId} not found`);
        }
      }
    }
    return null;
  },
});