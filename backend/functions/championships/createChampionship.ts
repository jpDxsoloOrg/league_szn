import { TableNames } from '../../lib/dynamodb';
import { handlerFactory } from '../../lib/handlers';
import { badRequest } from '../../lib/response';

export const handler = handlerFactory({
  tableName: TableNames.CHAMPIONSHIPS,
  idField: 'championshipId',
  entityName: 'championship',
  requiredFields: ['name', 'type'],
  optionalFields: ['currentChampion', 'divisionId', 'imageUrl'],
  defaults: {
    isActive: true,
  },
  validate: async (body, _event) => {
    if (body.type !== 'singles' && body.type !== 'tag') {
      return badRequest('Type must be either "singles" or "tag"');
    }
    return null;
  },
});
