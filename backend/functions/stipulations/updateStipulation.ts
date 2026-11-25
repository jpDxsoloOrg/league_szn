import { updateHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import { validateSimCategoryField } from '../../lib/sim/category';
import type { StipulationPatch } from '../../lib/repositories/CompetitionRepository';
import type { Stipulation } from '../../lib/repositories/types';

export const handler = updateHandlerFactory<StipulationPatch, Stipulation>({
  repo: () => getRepositories().competition.stipulations,
  entityName: 'stipulation',
  idParam: 'stipulationId',
  patchFields: ['name', 'description', 'simCategory'],
  validate: validateSimCategoryField,
});
