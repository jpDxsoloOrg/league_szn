import { handler as getPublishedVideosHandler } from './getPublishedVideos';
import { handler as getVideoHandler } from './getVideo';
import { handler as listVideosHandler } from './listVideos';
import { handler as createVideoHandler } from './createVideo';
import { handler as updateVideoHandler } from './updateVideo';
import { handler as deleteVideoHandler } from './deleteVideo';
import { createRouter, type RouteConfig } from '../../lib/router';

const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/videos',
    method: 'GET',
    handler: getPublishedVideosHandler,
  },
  {
    resource: '/videos/{videoId}',
    method: 'GET',
    handler: getVideoHandler,
  },
  {
    resource: '/admin/videos',
    method: 'GET',
    handler: listVideosHandler,
    requireAuth: true,
  },
  {
    resource: '/admin/videos',
    method: 'POST',
    handler: createVideoHandler,
    requireAuth: true,
  },
  {
    resource: '/admin/videos/{videoId}',
    method: 'PUT',
    handler: updateVideoHandler,
    requireAuth: true,
  },
  {
    resource: '/admin/videos/{videoId}',
    method: 'DELETE',
    handler: deleteVideoHandler,
    requireAuth: true,
  },
];

export const handler = createRouter(routes);
