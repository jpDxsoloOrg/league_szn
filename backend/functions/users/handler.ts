import { handler as listUsersHandler } from './listUsers';
import { handler as updateUserRoleHandler } from './updateUserRole';
import { handler as toggleUserEnabledHandler } from './toggleUserEnabled';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for users (admin): routes by HTTP method and resource.
 * Replaces listUsers, updateUserRole, toggleUserEnabled.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/admin/users',
    method: 'GET',
    handler: listUsersHandler,
  },
  {
    resource: '/admin/users/role',
    method: 'POST',
    handler: updateUserRoleHandler,
  },
  {
    resource: '/admin/users/toggle-enabled',
    method: 'POST',
    handler: toggleUserEnabledHandler,
  },
];

export const handler = createRouter(routes);
