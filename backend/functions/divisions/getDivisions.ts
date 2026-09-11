import { listHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import { sortDivisionsByRank } from '../../lib/divisionLadder';
import type { Division } from '../../lib/repositories/types';

/** Public list, sorted by ladder rank (bottom → top) then unranked by createdAt. */
export const handler = listHandlerFactory<Division>({
  repo: () => {
    const divisions = getRepositories().leagueOps.divisions;
    return { list: async () => sortDivisionsByRank(await divisions.list()) };
  },
  entityName: 'divisions',
});
