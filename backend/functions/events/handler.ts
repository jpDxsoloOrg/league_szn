import { handler as getEventsHandler } from './getEvents';
import { handler as getEventHandler } from './getEvent';
import { handler as getCommentaryHandler } from './getCommentary';
import { handler as createEventHandler } from './createEvent';
import { handler as updateEventHandler } from './updateEvent';
import { handler as deleteEventHandler } from './deleteEvent';
import { handler as checkInHandler } from './checkIn';
import { handler as getMyCheckInHandler } from './getMyCheckIn';
import { handler as deleteCheckInHandler } from './deleteCheckIn';
import { handler as getCheckInSummaryHandler } from './getCheckInSummary';
import { handler as getCheckInsHandler } from './getCheckIns';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/events',
    method: 'GET',
    handler: getEventsHandler,
    access: 'public',
  },
  {
    resource: '/events/{eventId}',
    method: 'GET',
    handler: getEventHandler,
    access: 'public',
  },
  {
    resource: '/events/{eventId}/commentary',
    method: 'GET',
    handler: getCommentaryHandler,
    access: 'public',
  },
  {
    resource: '/events',
    method: 'POST',
    handler: createEventHandler,
    access: STAFF,
  },
  {
    resource: '/events/{eventId}',
    method: 'PUT',
    handler: updateEventHandler,
    access: STAFF,
  },
  {
    resource: '/events/{eventId}',
    method: 'DELETE',
    handler: deleteEventHandler,
    access: STAFF,
  },
  {
    resource: '/events/{eventId}/check-in',
    method: 'POST',
    handler: checkInHandler,
    access: 'self-service',
  },
  {
    resource: '/events/{eventId}/check-in/me',
    method: 'GET',
    handler: getMyCheckInHandler,
    access: 'self-service',
  },
  {
    resource: '/events/{eventId}/check-in',
    method: 'DELETE',
    handler: deleteCheckInHandler,
    access: 'self-service',
  },
  {
    resource: '/events/{eventId}/check-ins/summary',
    method: 'GET',
    handler: getCheckInSummaryHandler,
    access: 'self-service',
  },
  {
    resource: '/events/{eventId}/check-ins',
    method: 'GET',
    handler: getCheckInsHandler,
    access: STAFF,
  },
];
export const handler = createRouter(routes);
