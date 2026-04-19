import { deleteHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { MatchType } from '../../lib/repositories/types';

export const handler = deleteHandlerFactory<MatchType>({
  repo: () => getRepositories().competition.matchTypes,
  entityName: 'match type',
  idParam: 'matchTypeId',
  entityLabel: 'Match type',
});
