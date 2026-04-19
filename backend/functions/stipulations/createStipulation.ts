import { createHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { StipulationCreateInput } from '../../lib/repositories/StipulationsRepository';
import type { Stipulation } from '../../lib/repositories/types';

export const handler = createHandlerFactory<StipulationCreateInput, Stipulation>({
  repo: () => getRepositories().competition.stipulations,
  entityName: 'stipulation',
  requiredFields: ['name'],
  optionalFields: ['description'],
});
