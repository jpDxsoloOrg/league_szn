import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { createRouter, STAFF, type RouteConfig } from '../../lib/router';
import { handler as getContendersHandler } from './getContenders';
import { handler as calculateRankingsHandler } from './calculateRankings';
import { handler as setOverrideHandler } from './setOverride';
import { handler as removeOverrideHandler } from './removeOverride';
import { handler as getOverridesHandler } from './getOverrides';

const noopCallback = () => {};

/**
 * Single Lambda for contenders: routes by HTTP method and resource.
 * Replaces getContenders, calculateRankings, and override CRUD.
 * Timeout 29s for calculateRankings (set in serverless.yml).
 * These routes have no gateway authorizer, so the router verifies the caller.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/championships/{championshipId}/contenders',
    method: 'GET',
    handler: getContendersHandler,
    access: 'public',
  },
  {
    resource: '/admin/contenders/recalculate',
    method: 'POST',
    handler: calculateRankingsHandler,
    access: STAFF,
  },
  {
    resource: '/admin/contenders/overrides',
    method: 'GET',
    handler: getOverridesHandler,
    access: STAFF,
  },
  {
    resource: '/admin/contenders/overrides',
    method: 'POST',
    handler: setOverrideHandler,
    access: STAFF,
  },
  {
    resource: '/admin/contenders/overrides/{championshipId}/{playerId}',
    method: 'DELETE',
    handler: removeOverrideHandler,
    access: STAFF,
  },
];

const router = createRouter(routes);

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  // API Gateway always sets requestContext, so its absence means a direct
  // Lambda invocation from another function: a recalculation, with no caller
  // to check, whichever function requested it.
  if (event.requestContext == null) {
    return (await calculateRankingsHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
  }

  return (await router(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
};
