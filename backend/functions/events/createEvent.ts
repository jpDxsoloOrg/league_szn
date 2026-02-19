import { TableNames } from '../../lib/dynamodb';
import { handlerFactory } from '../../lib/handlers';
import { badRequest } from '../../lib/response';

export const handler = handlerFactory({
  tableName: TableNames.EVENTS,
  idField: 'eventId',
  entityName: 'event',
  requiredFields: ['name', 'eventType', 'date'],
  nullableFields: ['venue', 'description', 'imageUrl', 'themeColor', 'seasonId', 'fantasyBudget', 'fantasyPicksPerDivision'],
  defaults: { status: 'upcoming', matchCards: [], attendance: null, rating: null, fantasyEnabled: true },
  validate: async (body, _event) => {
    if (body.eventType !== 'ppv' && body.eventType !== 'weekly' && body.eventType !== 'special' && body.eventType !== 'house') {
      return badRequest('eventType must be one of ppv, weekly, special, or house');
    }
    return null;
  },
});