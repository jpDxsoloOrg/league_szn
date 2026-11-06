import { handler as createTransferRequestHandler } from './createTransferRequest';
import { handler as getMyTransferRequestsHandler } from './getMyTransferRequests';
import { handler as getTransferRequestsHandler } from './getTransferRequests';
import { handler as reviewTransferRequestHandler } from './reviewTransferRequest';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  { resource: '/transfers', method: 'POST', handler: createTransferRequestHandler, access: 'self-service' },
  { resource: '/transfers/me', method: 'GET', handler: getMyTransferRequestsHandler, access: 'self-service' },
  { resource: '/admin/transfers', method: 'GET', handler: getTransferRequestsHandler, access: STAFF },
  { resource: '/admin/transfers/{requestId}', method: 'PUT', handler: reviewTransferRequestHandler, access: STAFF },
];

export const handler = createRouter(routes);
