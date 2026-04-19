import { getRepositories } from '../../lib/repositories';
import type { CompanyCreateInput } from '../../lib/repositories';
import { createHandlerFactory } from '../../lib/handlers';

export const handler = createHandlerFactory<CompanyCreateInput, unknown>({
  repo: () => getRepositories().leagueOps.companies,
  entityName: 'company',
  requiredFields: ['name'],
  optionalFields: ['abbreviation', 'imageUrl', 'description'],
});
