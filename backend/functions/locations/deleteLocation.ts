import { getRepositories } from '../../lib/repositories';
import { deleteHandlerFactory } from '../../lib/handlers';

export const handler = deleteHandlerFactory<unknown>({
  repo: () => getRepositories().leagueOps.locations,
  entityName: 'location',
  idParam: 'locationId',
});
