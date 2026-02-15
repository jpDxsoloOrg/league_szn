import { APIGatewayProxyEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getEventsHandler } from './getEvents';
import { handler as getEventHandler } from './getEvent';
import { handler as createEventHandler } from './createEvent';
import { handler as updateEventHandler } from './updateEvent';
import { handler as deleteEventHandler } from './deleteEvent';

/**
 * Single Lambda for events: routes by HTTP method and path.
 * Replaces getEvents, getEvent, createEvent, updateEvent, deleteEvent.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  const method = event.httpMethod?.toUpperCase() ?? event.requestContext?.http?.method?.toUpperCase();
  const pathParams = event.pathParameters ?? {};
  const eventId = pathParams.eventId;

  if (method === 'GET' && !eventId) {
    return getEventsHandler(event, context);
  }
  if (method === 'GET' && eventId) {
    return getEventHandler(event, context);
  }
  if (method === 'POST' && !eventId) {
    return createEventHandler(event, context);
  }
  if (method === 'PUT' && eventId) {
    return updateEventHandler(event, context);
  }
  if (method === 'DELETE' && eventId) {
    return deleteEventHandler(event, context);
  }

  return methodNotAllowed();
};
