import { updateHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import { validateSimCategoryField } from '../../lib/sim/category';
import type { MatchTypePatch } from '../../lib/repositories/CompetitionRepository';
import type { MatchType } from '../../lib/repositories/types';

export const handler = updateHandlerFactory<MatchTypePatch, MatchType>({
  repo: () => getRepositories().competition.matchTypes,
  entityName: 'match type',
  idParam: 'matchTypeId',
  entityLabel: 'Match type',
  patchFields: ['name', 'description', 'simCategory'],
  validate: validateSimCategoryField,
});
