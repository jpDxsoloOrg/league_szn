import { handler as listUsersHandler } from './listUsers';
import { handler as updateUserRoleHandler } from './updateUserRole';
import { handler as toggleUserEnabledHandler } from './toggleUserEnabled';
import { handler as deleteUserHandler } from './deleteUser';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for users (admin): routes by HTTP method and resource.
 * Replaces listUsers, updateUserRole, toggleUserEnabled, deleteUser.
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
  {
    resource: '/admin/users/delete',
    method: 'POST',
    handler: deleteUserHandler,
  },
];

export const handler = createRouter(routes);
