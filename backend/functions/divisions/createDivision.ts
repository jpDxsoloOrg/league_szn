import { createHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { DivisionCreateInput } from '../../lib/repositories/DivisionsRepository';
import type { Division } from '../../lib/repositories/types';

export const handler = createHandlerFactory<DivisionCreateInput, Division>({
  repo: () => getRepositories().leagueOps.divisions,
  entityName: 'division',
  requiredFields: ['name'],
  optionalFields: ['description'],
});
