import { getRepositories } from '../../lib/repositories';
import type { Company, CompanyPatch } from '../../lib/repositories';
import { updateHandlerFactory } from '../../lib/handlers';

export const handler = updateHandlerFactory<CompanyPatch, Company>({
  repo: () => getRepositories().leagueOps.companies,
  entityName: 'company',
  idParam: 'companyId',
  patchFields: ['name', 'abbreviation', 'imageUrl', 'description'],
});
