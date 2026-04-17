import { updateHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { StipulationPatch } from '../../lib/repositories/StipulationsRepository';
import type { Stipulation } from '../../lib/repositories/types';

export const handler = updateHandlerFactory<StipulationPatch, Stipulation>({
  repo: () => getRepositories().stipulations,
  entityName: 'stipulation',
  idParam: 'stipulationId',
  patchFields: ['name', 'description'],
});
