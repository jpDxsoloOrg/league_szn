import { handler as listUsersHandler } from './listUsers';
import { handler as updateUserRoleHandler } from './updateUserRole';
import { handler as toggleUserEnabledHandler } from './toggleUserEnabled';
import { handler as deleteUserHandler } from './deleteUser';
import { handler as syncWrestlerRolesHandler } from './syncWrestlerRoles';
import { createRouter, type RouteConfig, ADMIN_ONLY } from '../../lib/router';

/**
 * Single Lambda for users (admin): routes by HTTP method and resource.
 * Replaces listUsers, updateUserRole, toggleUserEnabled, deleteUser.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/admin/users',
    method: 'GET',
    handler: listUsersHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/admin/users/role',
    method: 'POST',
    handler: updateUserRoleHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/admin/users/toggle-enabled',
    method: 'POST',
    handler: toggleUserEnabledHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/admin/users/delete',
    method: 'POST',
    handler: deleteUserHandler,
    access: ADMIN_ONLY,
  },
  {
    resource: '/admin/users/sync-roles',
    method: 'POST',
    handler: syncWrestlerRolesHandler,
    access: ADMIN_ONLY,
  },
];

export const handler = createRouter(routes);
