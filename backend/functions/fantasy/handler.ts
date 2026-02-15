import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { methodNotAllowed } from '../../lib/response';
import { handler as getFantasyConfigHandler } from './getFantasyConfig';
import { handler as updateFantasyConfigHandler } from './updateFantasyConfig';
import { handler as getWrestlerCostsHandler } from './getWrestlerCosts';
import { handler as initializeWrestlerCostsHandler } from './initializeWrestlerCosts';
import { handler as recalculateWrestlerCostsHandler } from './recalculateWrestlerCosts';
import { handler as updateWrestlerCostHandler } from './updateWrestlerCost';
import { handler as getFantasyLeaderboardHandler } from './getFantasyLeaderboard';
import { handler as scoreCompletedEventsHandler } from './scoreCompletedEvents';
import { handler as submitPicksHandler } from './submitPicks';
import { handler as getUserPicksHandler } from './getUserPicks';
import { handler as getAllMyPicksHandler } from './getAllMyPicks';
import { handler as clearPicksHandler } from './clearPicks';

const noopCallback = () => {};

/**
 * Single Lambda for fantasy: routes by HTTP method and path.
 * Replaces all 12 fantasy handlers. Timeout 29s for long-running handlers (set in serverless.yml).
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  // Direct Lambda invocation (e.g. from recordResult) — no requestContext
  const isApiGateway = event.requestContext != null;
  if (!isApiGateway && (event as { source?: string }).source === 'recordResult') {
    return (await recalculateWrestlerCostsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const path = event.path ?? '';
  const pathParams = event.pathParameters ?? {};

  // Most specific path patterns first
  if (path.includes('recalculate') && method === 'POST') {
    return (await recalculateWrestlerCostsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('initialize') && method === 'POST') {
    return (await initializeWrestlerCostsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('fantasy/score') && method === 'POST') {
    return (await scoreCompletedEventsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('me/picks') && method === 'GET') {
    return (await getAllMyPicksHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('leaderboard') && method === 'GET') {
    return (await getFantasyLeaderboardHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('wrestlers/costs') && method === 'GET') {
    return (await getWrestlerCostsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('fantasy/config')) {
    if (method === 'GET') {
      return (await getFantasyConfigHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
    if (method === 'PUT') {
      return (await updateFantasyConfigHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
  }
  if (path.endsWith('/cost') && pathParams.playerId && method === 'PUT') {
    return (await updateWrestlerCostHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }
  if (path.includes('picks') && pathParams.eventId) {
    if (method === 'POST') {
      return (await submitPicksHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
    if (method === 'GET') {
      return (await getUserPicksHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
    if (method === 'DELETE') {
      return (await clearPicksHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
    }
  }

  return methodNotAllowed();
};
