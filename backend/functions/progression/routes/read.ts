import { STAFF, type RouteConfig } from '../../../lib/router';
import { notImplemented } from './notImplemented';

/**
 * Routes owned by CUP-04 (#182): GET /progression/players/{playerId}, GET|POST /progression/tracks, PUT /progression/tracks/{trackId}, GET /progression/tracks/{trackId}/players
 */
export const readRoutes: ReadonlyArray<RouteConfig> = [
  { resource: '/progression/players/{playerId}', method: 'GET', handler: notImplemented, access: 'public' },
  { resource: '/progression/tracks', method: 'GET', handler: notImplemented, access: 'public' },
  { resource: '/progression/tracks', method: 'POST', handler: notImplemented, access: STAFF },
  { resource: '/progression/tracks/{trackId}', method: 'PUT', handler: notImplemented, access: STAFF },
  { resource: '/progression/tracks/{trackId}/players', method: 'GET', handler: notImplemented, access: STAFF },
];
