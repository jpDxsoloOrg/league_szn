import { handler as getChampionshipsHandler } from './getChampionships';
import { handler as createChampionshipHandler } from './createChampionship';
import { handler as getChampionshipHistoryHandler } from './getChampionshipHistory';
import { handler as updateChampionshipHandler } from './updateChampionship';
import { handler as deleteChampionshipHandler } from './deleteChampionship';
import { handler as vacateChampionshipHandler } from './vacateChampionship';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for championships: routes by HTTP method and resource.
 * Replaces getChampionships, createChampionship, getChampionshipHistory, updateChampionship, deleteChampionship, vacateChampionship.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/championships',
    method: 'GET',
    handler: getChampionshipsHandler,
  },
  {
    resource: '/championships',
    method: 'POST',
    handler: createChampionshipHandler,
  },
  {
    resource: '/championships/{championshipId}/history',
    method: 'GET',
    handler: getChampionshipHistoryHandler,
  },
  {
    resource: '/championships/{championshipId}',
    method: 'PUT',
    handler: updateChampionshipHandler,
  },
  {
    resource: '/championships/{championshipId}',
    method: 'DELETE',
    handler: deleteChampionshipHandler,
  },
  {
    resource: '/championships/{championshipId}/vacate',
    method: 'POST',
    handler: vacateChampionshipHandler,
  },
];

export const handler = createRouter(routes);
