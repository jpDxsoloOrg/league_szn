import { STAFF, type RouteConfig } from '../../../lib/router';
import { getPlayerProgression } from '../getPlayerProgression';
import { getTrackBoard } from '../getTrackBoard';
import { createTrack, listTracks, updateTrack } from '../tracks';

/**
 * Routes owned by CUP-04 (#182): GET /progression/players/{playerId}, GET|POST /progression/tracks, PUT /progression/tracks/{trackId}, GET /progression/tracks/{trackId}/players
 */
export const readRoutes: ReadonlyArray<RouteConfig> = [
  // Public: the handler adds goal detail for the owner and GM notes for Moderator+.
  { resource: '/progression/players/{playerId}', method: 'GET', handler: getPlayerProgression, access: 'public' },
  { resource: '/progression/tracks', method: 'GET', handler: listTracks, access: 'public' },
  { resource: '/progression/tracks', method: 'POST', handler: createTrack, access: STAFF },
  { resource: '/progression/tracks/{trackId}', method: 'PUT', handler: updateTrack, access: STAFF },
  { resource: '/progression/tracks/{trackId}/players', method: 'GET', handler: getTrackBoard, access: STAFF },
];
