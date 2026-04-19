import { createHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { MatchTypeCreateInput } from '../../lib/repositories/MatchTypesRepository';
import type { MatchType } from '../../lib/repositories/types';

export const handler = createHandlerFactory<MatchTypeCreateInput, MatchType>({
  repo: () => getRepositories().competition.matchTypes,
  entityName: 'match type',
  requiredFields: ['name'],
  optionalFields: ['description'],
});
