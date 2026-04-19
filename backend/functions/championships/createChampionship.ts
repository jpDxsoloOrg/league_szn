import { createHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { ChampionshipCreateInput, Championship } from '../../lib/repositories';
import { badRequest } from '../../lib/response';

export const handler = createHandlerFactory<ChampionshipCreateInput, Championship>({
  repo: () => getRepositories().competition.championships,
  entityName: 'championship',
  requiredFields: ['name', 'type'],
  optionalFields: ['currentChampion', 'divisionId', 'imageUrl'],
  validate: async (body) => {
    if (body.type !== 'singles' && body.type !== 'tag') {
      return badRequest('Type must be either "singles" or "tag"');
    }
    return null;
  },
});
