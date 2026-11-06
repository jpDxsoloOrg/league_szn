import { handler as getActiveAnnouncementsHandler } from './getActiveAnnouncements';
import { handler as listAnnouncementsHandler } from './listAnnouncements';
import { handler as createAnnouncementHandler } from './createAnnouncement';
import { handler as updateAnnouncementHandler } from './updateAnnouncement';
import { handler as deleteAnnouncementHandler } from './deleteAnnouncement';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

/**
 * Single Lambda for announcements: routes by HTTP method and resource.
 * Public: getActiveAnnouncements
 * Admin: list, create, update, delete
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/announcements/active',
    method: 'GET',
    handler: getActiveAnnouncementsHandler,
    access: 'public',
  },
  {
    resource: '/admin/announcements',
    method: 'GET',
    handler: listAnnouncementsHandler,
    access: STAFF,
  },
  {
    resource: '/admin/announcements',
    method: 'POST',
    handler: createAnnouncementHandler,
    access: STAFF,
  },
  {
    resource: '/admin/announcements/{announcementId}',
    method: 'PUT',
    handler: updateAnnouncementHandler,
    access: STAFF,
  },
  {
    resource: '/admin/announcements/{announcementId}',
    method: 'DELETE',
    handler: deleteAnnouncementHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
