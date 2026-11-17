import { listHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import { sortDivisionsByTier } from '../../lib/divisionTiers';
import type { Division } from '../../lib/repositories/types';

export const handler = listHandlerFactory<Division>({
  // Top tier first, then untiered, then developmental (DMV-01).
  repo: () => ({
    list: async () => sortDivisionsByTier(await getRepositories().leagueOps.divisions.list()),
  }),
  entityName: 'divisions',
});
