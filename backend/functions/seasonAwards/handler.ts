import { createRouter, STAFF, type RouteConfig } from '../../lib/router';
import { handler as getSeasonAwardsHandler } from './getSeasonAwards';
import { handler as createSeasonAwardHandler } from './createSeasonAward';
import { handler as deleteSeasonAwardHandler } from './deleteSeasonAward';

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/seasons/{seasonId}/awards',
    method: 'GET',
    handler: getSeasonAwardsHandler,
    access: 'public',
  },
  {
    resource: '/seasons/{seasonId}/awards',
    method: 'POST',
    handler: createSeasonAwardHandler,
    access: STAFF,
  },
  {
    resource: '/seasons/{seasonId}/awards/{awardId}',
    method: 'DELETE',
    handler: deleteSeasonAwardHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
