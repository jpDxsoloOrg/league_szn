import { handler as getLocationsHandler } from './getLocations';
import { handler as getLocationHandler } from './getLocation';
import { handler as createLocationHandler } from './createLocation';
import { handler as updateLocationHandler } from './updateLocation';
import { handler as deleteLocationHandler } from './deleteLocation';
import { handler as bulkImportHandler } from './bulkImport';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/locations',
    method: 'GET',
    handler: getLocationsHandler,
    access: 'public',
  },
  {
    resource: '/locations',
    method: 'POST',
    handler: createLocationHandler,
    access: STAFF,
  },
  {
    resource: '/locations/bulk',
    method: 'POST',
    handler: bulkImportHandler,
    access: STAFF,
  },
  {
    resource: '/locations/{locationId}',
    method: 'GET',
    handler: getLocationHandler,
    access: 'public',
  },
  {
    resource: '/locations/{locationId}',
    method: 'PUT',
    handler: updateLocationHandler,
    access: STAFF,
  },
  {
    resource: '/locations/{locationId}',
    method: 'DELETE',
    handler: deleteLocationHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
