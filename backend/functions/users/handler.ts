import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as listUsersHandler } from './listUsers';
import { handler as updateUserRoleHandler } from './updateUserRole';
import { handler as toggleUserEnabledHandler } from './toggleUserEnabled';

const noopCallback = () => {};

/**
 * Single Lambda for users (admin): routes by HTTP method and path.
 * Replaces listUsers, updateUserRole, toggleUserEnabled.
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const path = event.path ?? '';

  if (method === 'GET' && path.includes('users') && !path.includes('role') && !path.includes('toggle-enabled')) {
    return (await listUsersHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && path.includes('role')) {
    return (await updateUserRoleHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'POST' && path.includes('toggle-enabled')) {
    return (await toggleUserEnabledHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
