


import { TableNames } from '../../lib/dynamodb';
import { handlerFactory } from '../../lib/handlers';

export const handler = handlerFactory({
  tableName: TableNames.MATCH_TYPES,
  idField: 'matchTypeId',
  entityName: 'matchType',
  requiredFields: ['name'],
  optionalFields: ['description'],
});

