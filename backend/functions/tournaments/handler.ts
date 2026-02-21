import { handler as getTournamentsHandler } from './getTournaments';
import { handler as createTournamentHandler } from './createTournament';
import { handler as updateTournamentHandler } from './updateTournament';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for tournaments: routes by HTTP method and resource.
 * Replaces getTournaments, createTournament, updateTournament.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/tournaments',
    method: 'GET',
    handler: getTournamentsHandler,
  },
  {
    resource: '/tournaments',
    method: 'POST',
    handler: createTournamentHandler,
  },
  {
    resource: '/tournaments/{tournamentId}',
    method: 'PUT',
    handler: updateTournamentHandler,
  },
];

export const handler = createRouter(routes);
