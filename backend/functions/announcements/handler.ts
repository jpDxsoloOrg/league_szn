import { handler as getActiveAnnouncementsHandler } from './getActiveAnnouncements';
import { handler as listAnnouncementsHandler } from './listAnnouncements';
import { handler as createAnnouncementHandler } from './createAnnouncement';
import { handler as updateAnnouncementHandler } from './updateAnnouncement';
import { handler as deleteAnnouncementHandler } from './deleteAnnouncement';
import { createRouter, type RouteConfig } from '../../lib/router';

/**
 * Single Lambda for announcements: routes by HTTP method and resource.
 * Public: getActiveAnnouncements
 * Admin: list, create, update, delete
 */
const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/announcements/active',
    method: 'GET',
    handler: getActiveAnnouncementsHandler,
  },
  {
    resource: '/admin/announcements',
    method: 'GET',
    handler: listAnnouncementsHandler,
    requireAuth: true,
  },
  {
    resource: '/admin/announcements',
    method: 'POST',
    handler: createAnnouncementHandler,
    requireAuth: true,
  },
  {
    resource: '/admin/announcements/{announcementId}',
    method: 'PUT',
    handler: updateAnnouncementHandler,
    requireAuth: true,
  },
  {
    resource: '/admin/announcements/{announcementId}',
    method: 'DELETE',
    handler: deleteAnnouncementHandler,
    requireAuth: true,
  },
];

export const handler = createRouter(routes);
