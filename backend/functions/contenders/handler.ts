import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed, unauthorized } from '../../lib/response';
import { authenticate } from '../../lib/authenticate';
import { handler as getContendersHandler } from './getContenders';
import { handler as calculateRankingsHandler } from './calculateRankings';
import { handler as setOverrideHandler } from './setOverride';
import { handler as removeOverrideHandler } from './removeOverride';
import { handler as getOverridesHandler } from './getOverrides';

const noopCallback = () => {};

async function requireAuth(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult | null> {
  const authResult = await authenticate(event);
  if (!authResult.ok) return unauthorized();
  return null;
}

/**
 * Single Lambda for contenders: routes by HTTP method and path.
 * Replaces getContenders, calculateRankings, and override CRUD.
 * Timeout 29s for calculateRankings (set in serverless.yml).
 * Admin routes authenticate in-Lambda via lib/authenticate (gateway-level
 * authorizer removed as part of CloudFormation resource reduction).
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  // Direct Lambda invocation (e.g. from recordResult) — no requestContext
  const isApiGateway = event.requestContext != null;
  if (!isApiGateway && (event as { source?: string }).source === 'recordResult') {
    return (await calculateRankingsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};

  // Override routes: POST, DELETE, GET on /overrides
  if (path.includes('overrides')) {
    if (method === 'POST') {
      const denied = await requireAuth(event);
      if (denied) return denied;
      return (await setOverrideHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
    if (method === 'DELETE' && pathParams.championshipId && pathParams.playerId) {
      const denied = await requireAuth(event);
      if (denied) return denied;
      return (await removeOverrideHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
    if (method === 'GET') {
      const denied = await requireAuth(event);
      if (denied) return denied;
      return (await getOverridesHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
  }

  if (path.includes('recalculate') && method === 'POST') {
    const denied = await requireAuth(event);
    if (denied) return denied;
    return (await calculateRankingsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (method === 'GET' && pathParams.championshipId) {
    return (await getContendersHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return methodNotAllowed();
};
