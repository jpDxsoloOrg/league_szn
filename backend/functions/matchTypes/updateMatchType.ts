import { updateHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { MatchTypePatch } from '../../lib/repositories/MatchTypesRepository';
import type { MatchType } from '../../lib/repositories/types';

export const handler = updateHandlerFactory<MatchTypePatch, MatchType>({
  repo: () => getRepositories().matchTypes,
  entityName: 'match type',
  idParam: 'matchTypeId',
  entityLabel: 'Match type',
  patchFields: ['name', 'description'],
});
