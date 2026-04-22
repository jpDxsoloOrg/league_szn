import { getHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { Wrestler } from '../../lib/repositories/types';

export const handler = getHandlerFactory<Wrestler>({
  repo: () => getRepositories().roster.wrestlers,
  entityName: 'wrestler',
  idParam: 'wrestlerId',
});
