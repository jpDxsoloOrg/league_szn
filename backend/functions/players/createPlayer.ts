import { getRepositories } from '../../lib/repositories';
import { notFound } from '../../lib/response';
import { createHandlerFactory } from '../../lib/handlers';
import type { PlayerCreateInput } from '../../lib/repositories';
import type { Player } from '../../lib/repositories/types';

export const handler = createHandlerFactory<PlayerCreateInput, Player>({
  repo: () => getRepositories().players,
  entityName: 'player',
  requiredFields: ['name', 'currentWrestler'],
  optionalFields: ['imageUrl', 'divisionId', 'psnId'],
  validate: async (body) => {
    if (body.divisionId) {
      const division = await getRepositories().divisions.findById(body.divisionId as string);
      if (!division) {
        return notFound(`Division ${body.divisionId} not found`);
      }
    }
    return null;
  },
});
