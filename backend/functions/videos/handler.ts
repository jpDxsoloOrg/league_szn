import { handler as getPublishedVideosHandler } from './getPublishedVideos';
import { handler as getVideoHandler } from './getVideo';
import { handler as listVideosHandler } from './listVideos';
import { handler as createVideoHandler } from './createVideo';
import { handler as updateVideoHandler } from './updateVideo';
import { handler as deleteVideoHandler } from './deleteVideo';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/videos',
    method: 'GET',
    handler: getPublishedVideosHandler,
    access: 'public',
  },
  {
    resource: '/videos/{videoId}',
    method: 'GET',
    handler: getVideoHandler,
    access: 'public',
  },
  {
    resource: '/admin/videos',
    method: 'GET',
    handler: listVideosHandler,
    access: 'self-service',
  },
  {
    resource: '/admin/videos',
    method: 'POST',
    handler: createVideoHandler,
    access: 'self-service',
  },
  {
    resource: '/admin/videos/{videoId}',
    method: 'PUT',
    handler: updateVideoHandler,
    access: STAFF,
  },
  {
    resource: '/admin/videos/{videoId}',
    method: 'DELETE',
    handler: deleteVideoHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
