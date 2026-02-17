import { handlerFactory } from '../../lib/handlers';

export const handler = handlerFactory({
  tableName: 'DIVISIONS',
  idField: 'divisionId',
  entityName: 'division',
  requiredFields: ['name'],
  optionalFields: ['description'],
});

