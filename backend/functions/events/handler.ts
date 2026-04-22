import { handler as getEventsHandler } from './getEvents';
import { handler as getEventHandler } from './getEvent';
import { handler as createEventHandler } from './createEvent';
import { handler as updateEventHandler } from './updateEvent';
import { handler as deleteEventHandler } from './deleteEvent';
import { handler as checkInHandler } from './checkIn';
import { handler as getMyCheckInHandler } from './getMyCheckIn';
import { handler as deleteCheckInHandler } from './deleteCheckIn';
import { handler as getCheckInSummaryHandler } from './getCheckInSummary';
import { handler as getCheckInsHandler } from './getCheckIns';
import { createRouter, RouteConfig } from '../../lib/router';

const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/events',
    method: 'GET',
    handler: getEventsHandler,
  },
  {
    resource: '/events/{eventId}',
    method: 'GET',
    handler: getEventHandler,
  },
  {
    resource: '/events',
    method: 'POST',
    handler: createEventHandler,
    requireAuth: true,
  },
  {
    resource: '/events/{eventId}',
    method: 'PUT',
    handler: updateEventHandler,
    requireAuth: true,
  },
  {
    resource: '/events/{eventId}',
    method: 'DELETE',
    handler: deleteEventHandler,
    requireAuth: true,
  },
  {
    resource: '/events/{eventId}/check-in',
    method: 'POST',
    handler: checkInHandler,
    requireAuth: true,
  },
  {
    resource: '/events/{eventId}/check-in/me',
    method: 'GET',
    handler: getMyCheckInHandler,
    requireAuth: true,
  },
  {
    resource: '/events/{eventId}/check-in',
    method: 'DELETE',
    handler: deleteCheckInHandler,
    requireAuth: true,
  },
  {
    resource: '/events/{eventId}/check-ins/summary',
    method: 'GET',
    handler: getCheckInSummaryHandler,
    requireAuth: true,
  },
  {
    resource: '/events/{eventId}/check-ins',
    method: 'GET',
    handler: getCheckInsHandler,
    requireAuth: true,
  },
];
export const handler = createRouter(routes);
