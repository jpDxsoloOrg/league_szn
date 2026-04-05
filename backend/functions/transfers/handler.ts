import { handler as createTransferRequestHandler } from './createTransferRequest';
import { handler as getMyTransferRequestsHandler } from './getMyTransferRequests';
import { handler as getTransferRequestsHandler } from './getTransferRequests';
import { handler as reviewTransferRequestHandler } from './reviewTransferRequest';
import { createRouter, type RouteConfig } from '../../lib/router';

const routes: ReadonlyArray<RouteConfig> = [
  { resource: '/transfers', method: 'POST', handler: createTransferRequestHandler },
  { resource: '/transfers/me', method: 'GET', handler: getMyTransferRequestsHandler },
  { resource: '/admin/transfers', method: 'GET', handler: getTransferRequestsHandler },
  { resource: '/admin/transfers/{requestId}', method: 'PUT', handler: reviewTransferRequestHandler },
];

export const handler = createRouter(routes);
