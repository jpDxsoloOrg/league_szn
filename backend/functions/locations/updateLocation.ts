import type { LocationPatch } from '../../lib/repositories';
import { getRepositories } from '../../lib/repositories';
import { updateHandlerFactory } from '../../lib/handlers';

export const handler = updateHandlerFactory<LocationPatch, unknown>({
  repo: () => getRepositories().leagueOps.locations,
  entityName: 'location',
  idParam: 'locationId',
  patchFields: [
    'name',
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
