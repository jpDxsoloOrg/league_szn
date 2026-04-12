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
  },
  {
    resource: '/events/{eventId}',
    method: 'PUT',
    handler: updateEventHandler,
  },
  {
    resource: '/events/{eventId}',
    method: 'DELETE',
    handler: deleteEventHandler,
  },
  {
    resource: '/events/{eventId}/check-in',
    method: 'POST',
    handler: checkInHandler,
  },
  {
    resource: '/events/{eventId}/check-in/me',
    method: 'GET',
    handler: getMyCheckInHandler,
  },
  {
    resource: '/events/{eventId}/check-in',
    method: 'DELETE',
    handler: deleteCheckInHandler,
  },
  {
    resource: '/events/{eventId}/check-ins/summary',
    method: 'GET',
    handler: getCheckInSummaryHandler,
  },
  {
    resource: '/events/{eventId}/check-ins',
    method: 'GET',
    handler: getCheckInsHandler,
  },
];
export const handler = createRouter(routes);