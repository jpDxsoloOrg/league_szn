import { deleteHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { Stipulation } from '../../lib/repositories/types';

export const handler = deleteHandlerFactory<Stipulation>({
  repo: () => getRepositories().competition.stipulations,
  entityName: 'stipulation',
  idParam: 'stipulationId',
});
