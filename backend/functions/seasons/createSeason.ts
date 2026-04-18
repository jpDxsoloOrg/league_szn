import { getRepositories } from '../../lib/repositories';
import type { SeasonCreateInput } from '../../lib/repositories';
import { conflict } from '../../lib/response';
import { createHandlerFactory } from '../../lib/handlers';

export const handler = createHandlerFactory<SeasonCreateInput, unknown>({
  repo: () => getRepositories().seasons,
  entityName: 'season',
  requiredFields: ['name', 'startDate'],
  optionalFields: ['endDate'],
  validate: async () => {
    const { seasons } = getRepositories();
    const active = await seasons.findActive();
    if (active) {
      return conflict('There is already an active season. Please end the current season before creating a new one.');
    }
    return null;
  },
});
