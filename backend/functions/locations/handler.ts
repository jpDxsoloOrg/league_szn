import { handler as getLocationsHandler } from './getLocations';
import { handler as getLocationHandler } from './getLocation';
import { handler as createLocationHandler } from './createLocation';
import { handler as updateLocationHandler } from './updateLocation';
import { handler as deleteLocationHandler } from './deleteLocation';
import { handler as bulkImportHandler } from './bulkImport';
import { createRouter, RouteConfig } from '../../lib/router';

const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/locations',
    method: 'GET',
    handler: getLocationsHandler,
  },
  {
    resource: '/locations',
    method: 'POST',
    handler: createLocationHandler,
    requireAuth: true,
  },
  {
    resource: '/locations/bulk',
    method: 'POST',
    handler: bulkImportHandler,
    requireAuth: true,
  },
  {
    resource: '/locations/{locationId}',
    method: 'GET',
    handler: getLocationHandler,
  },
  {
    resource: '/locations/{locationId}',
    method: 'PUT',
    handler: updateLocationHandler,
    requireAuth: true,
  },
  {
    resource: '/locations/{locationId}',
    method: 'DELETE',
    handler: deleteLocationHandler,
    requireAuth: true,
  },
];

export const handler = createRouter(routes);
