import { handler as getChampionshipsHandler } from './getChampionships';
import { handler as createChampionshipHandler } from './createChampionship';
import { handler as getChampionshipHistoryHandler } from './getChampionshipHistory';
import { handler as updateChampionshipHandler } from './updateChampionship';
import { handler as deleteChampionshipHandler } from './deleteChampionship';
import { handler as vacateChampionshipHandler } from './vacateChampionship';
import { handler as assignChampionHandler } from './assignChampion';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

/**
 * Single Lambda for championships: routes by HTTP method and resource.
 * Replaces getChampionships, createChampionship, getChampionshipHistory, updateChampionship, deleteChampionship, vacateChampionship.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/championships',
    method: 'GET',
    handler: getChampionshipsHandler,
    access: 'public',
  },
  {
    resource: '/championships',
    method: 'POST',
    handler: createChampionshipHandler,
    access: STAFF,
  },
  {
    resource: '/championships/{championshipId}/history',
    method: 'GET',
    handler: getChampionshipHistoryHandler,
    access: 'public',
  },
  {
    resource: '/championships/{championshipId}',
    method: 'PUT',
    handler: updateChampionshipHandler,
    access: STAFF,
  },
  {
    resource: '/championships/{championshipId}',
    method: 'DELETE',
    handler: deleteChampionshipHandler,
    access: STAFF,
  },
  {
    resource: '/championships/{championshipId}/vacate',
    method: 'POST',
    handler: vacateChampionshipHandler,
    access: STAFF,
  },
  {
    resource: '/championships/{championshipId}/assign',
    method: 'POST',
    handler: assignChampionHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
