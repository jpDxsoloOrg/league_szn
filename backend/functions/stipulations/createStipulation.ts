


import { TableNames } from '../../lib/dynamodb';
import { handlerFactory } from '../../lib/handlers';

export const handler = handlerFactory({
  tableName: TableNames.STIPULATIONS,
  idField: 'stipulationId',
  entityName: 'stipulation',
  requiredFields: ['name'],
  optionalFields: ['description'],
});

