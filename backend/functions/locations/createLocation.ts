import { getRepositories } from '../../lib/repositories';
import type { LocationCreateInput } from '../../lib/repositories';
import { createHandlerFactory } from '../../lib/handlers';

export const handler = createHandlerFactory<LocationCreateInput, unknown>({
  repo: () => getRepositories().leagueOps.locations,
  entityName: 'location',
  requiredFields: ['name'],
  optionalFields: [
    'city',
    'state',
    'country',
    'capacity',
    'latitude',
    'longitude',
    'imageUrl',
    'notes',
  ],
});
