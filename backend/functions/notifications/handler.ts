import { handler as getNotificationsHandler } from './getNotifications';
import { handler as getUnreadCountHandler } from './getUnreadCount';
import { handler as markReadHandler } from './markRead';
import { handler as markAllReadHandler } from './markAllRead';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for notifications: routes by HTTP method and resource.
 * Handles getNotifications, getUnreadCount, markRead, markAllRead.
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/notifications',
    method: 'GET',
    handler: getNotificationsHandler,
  },
  {
    resource: '/notifications/unread-count',
    method: 'GET',
    handler: getUnreadCountHandler,
  },
  {
    resource: '/notifications/{notificationId}/read',
    method: 'PUT',
    handler: markReadHandler,
  },
  {
    resource: '/notifications/mark-all-read',
    method: 'PUT',
    handler: markAllReadHandler,
  },
];

export const handler = createRouter(routes);
