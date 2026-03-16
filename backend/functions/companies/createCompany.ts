import { TableNames } from '../../lib/dynamodb';
import { handlerFactory } from '../../lib/handlers';

export const handler = handlerFactory({
  tableName: TableNames.COMPANIES,
  idField: 'companyId',
  entityName: 'company',
  requiredFields: ['name'],
  optionalFields: ['abbreviation', 'imageUrl', 'description'],
});
