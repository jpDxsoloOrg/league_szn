import { handler as getLiveStreamHandler } from './getLiveStream';
import { handler as updateLiveStreamHandler } from './updateLiveStream';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/live-stream',
    method: 'GET',
    handler: getLiveStreamHandler,
    access: 'public',
  },
  {
    resource: '/admin/live-stream',
    method: 'PUT',
    handler: updateLiveStreamHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
