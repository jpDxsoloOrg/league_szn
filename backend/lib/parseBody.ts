import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { badRequest } from './response';

/**
 * Safely parse the JSON body from an API Gateway event.
 * Returns the parsed object on success, or a 400 badRequest response on failure.
 */
export function parseBody<T = Record<string, any>>(
  event: APIGatewayProxyEvent
): { data: T; error?: never } | { data?: never; error: APIGatewayProxyResult } {
  try {
    if (!event.body) {
      return { error: badRequest('Request body is required') };
    }
    const data = JSON.parse(event.body) as T;
    return { data };
  } catch {
    return { error: badRequest('Invalid JSON in request body') };
  }
}