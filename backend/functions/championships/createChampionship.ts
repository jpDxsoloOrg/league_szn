import { createHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { ChampionshipCreateInput, Championship } from '../../lib/repositories';
import { badRequest } from '../../lib/response';
import { championIdsOf, firstBookingRefusal } from '../../lib/disciplineGates';

export const handler = createHandlerFactory<ChampionshipCreateInput, Championship>({
  repo: () => getRepositories().competition.championships,
  entityName: 'championship',
  requiredFields: ['name', 'type'],
  optionalFields: ['currentChampion', 'divisionId', 'imageUrl'],
  validate: async (body) => {
    if (body.type !== 'singles' && body.type !== 'tag') {
      return badRequest('Type must be either "singles" or "tag"');
    }
    const championIds = championIdsOf(body.currentChampion);
    if (championIds.length === 0) return null;
    const { roster: { players } } = getRepositories();
    return firstBookingRefusal(await Promise.all(championIds.map((id) => players.findById(id))));
  },
});
