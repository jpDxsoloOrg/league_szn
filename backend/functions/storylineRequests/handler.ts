import { handler as createStorylineRequestHandler } from './createStorylineRequest';
import { handler as getMyStorylineRequestsHandler } from './getMyStorylineRequests';
import { handler as getStorylineRequestsHandler } from './getStorylineRequests';
import { handler as reviewStorylineRequestHandler } from './reviewStorylineRequest';
import { createRouter, type RouteConfig } from '../../lib/router';

const routes: ReadonlyArray<RouteConfig> = [
  { resource: '/storyline-requests', method: 'POST', handler: createStorylineRequestHandler },
  { resource: '/storyline-requests/me', method: 'GET', handler: getMyStorylineRequestsHandler },
  { resource: '/admin/storyline-requests', method: 'GET', handler: getStorylineRequestsHandler },
  { resource: '/admin/storyline-requests/{requestId}', method: 'PUT', handler: reviewStorylineRequestHandler },
];

export const handler = createRouter(routes);
