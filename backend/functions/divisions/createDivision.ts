import { TableNames } from '../../lib/dynamodb';
import { handlerFactory } from '../../lib/handlers';

export const handler = handlerFactory({
  tableName: TableNames.DIVISIONS,
  idField: 'divisionId',
  entityName: 'division',
  requiredFields: ['name'],
  optionalFields: ['description'],
});

