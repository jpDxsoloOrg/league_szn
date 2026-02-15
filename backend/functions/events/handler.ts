import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getEventsHandler } from './getEvents';
import { handler as getEventHandler } from './getEvent';
import { handler as createEventHandler } from './createEvent';
import { handler as updateEventHandler } from './updateEvent';
import { handler as deleteEventHandler } from './deleteEvent';

const noopCallback = () => {};

/**
 * Single Lambda for events: routes by HTTP method and path params.
 * Replaces getEvents, getEvent, createEvent, updateEvent, deleteEvent.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const pathParams = event.pathParameters ?? {};

  if (method === 'GET' && !pathParams.eventId) {
    return (await getEventsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'GET' && pathParams.eventId) {
    return (await getEventHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && !pathParams.eventId) {
    return (await createEventHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'PUT' && pathParams.eventId) {
    return (await updateEventHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'DELETE' && pathParams.eventId) {
    return (await deleteEventHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
