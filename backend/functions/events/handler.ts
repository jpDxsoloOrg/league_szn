import { handler as getEventsHandler } from './getEvents';
import { handler as getEventHandler } from './getEvent';
import { handler as createEventHandler } from './createEvent';
import { handler as updateEventHandler } from './updateEvent';
import { handler as deleteEventHandler } from './deleteEvent';
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
];
export const handler = createRouter(routes);