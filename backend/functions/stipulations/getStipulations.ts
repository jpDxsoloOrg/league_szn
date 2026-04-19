import { listHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { Stipulation } from '../../lib/repositories/types';

export const handler = listHandlerFactory<Stipulation>({
  repo: () => getRepositories().competition.stipulations,
  entityName: 'stipulations',
});
