import { handler as getTournamentsHandler } from './getTournaments';
import { handler as createTournamentHandler } from './createTournament';
import { handler as updateTournamentHandler } from './updateTournament';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

/**
 * Single Lambda for tournaments: routes by HTTP method and resource.
 * Replaces getTournaments, createTournament, updateTournament.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/tournaments',
    method: 'GET',
    handler: getTournamentsHandler,
    access: 'public',
  },
  {
    resource: '/tournaments',
    method: 'POST',
    handler: createTournamentHandler,
    access: STAFF,
  },
  {
    resource: '/tournaments/{tournamentId}',
    method: 'PUT',
    handler: updateTournamentHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
