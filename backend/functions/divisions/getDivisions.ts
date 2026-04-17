import { listHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { Division } from '../../lib/repositories/types';

export const handler = listHandlerFactory<Division>({
  repo: () => getRepositories().divisions,
  entityName: 'divisions',
});
