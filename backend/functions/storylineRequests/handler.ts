import { handler as createStorylineRequestHandler } from './createStorylineRequest';
import { handler as getMyStorylineRequestsHandler } from './getMyStorylineRequests';
import { handler as getStorylineRequestsHandler } from './getStorylineRequests';
import { handler as reviewStorylineRequestHandler } from './reviewStorylineRequest';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  { resource: '/storyline-requests', method: 'POST', handler: createStorylineRequestHandler, access: 'self-service' },
  { resource: '/storyline-requests/me', method: 'GET', handler: getMyStorylineRequestsHandler, access: 'self-service' },
  { resource: '/admin/storyline-requests', method: 'GET', handler: getStorylineRequestsHandler, access: STAFF },
  { resource: '/admin/storyline-requests/{requestId}', method: 'PUT', handler: reviewStorylineRequestHandler, access: STAFF },
];

export const handler = createRouter(routes);
