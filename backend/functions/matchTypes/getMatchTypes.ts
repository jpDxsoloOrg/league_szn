import { listHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { MatchType } from '../../lib/repositories/types';

export const handler = listHandlerFactory<MatchType>({
  repo: () => getRepositories().competition.matchTypes,
  entityName: 'match types',
});
