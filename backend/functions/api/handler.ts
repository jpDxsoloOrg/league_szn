/**
 * The single HTTP entry point (INFRA-207). API Gateway sends every request
 * through one `ANY /{proxy+}` event to this Lambda; the merged route table in
 * ./routes does the routing and lib/router dispatch does the auth.
 * See docs/plans/plan-infra-207-api-simplification.md (sections 5.1, 5.5, 5.9).
 */
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { createRouter } from '../../lib/router';
import { handler as createAdminUserHandler } from '../auth/createAdminUser';
import { allRoutes } from './routes';

const noopCallback = () => {};

/** The stage prefix serverless-offline leaves on event.path and event.resource. */
const OFFLINE_STAGE_PREFIX = '/dev';

/** Log label for requests that matched no route (404) or no method (405). */
export const UNMATCHED_ROUTE = 'UNMATCHED';

/**
 * Unauthenticated non-GET entry points, handled before the router so the
 * router's "no public writes" invariant stays intact. Each handler does its
 * own check: createAdminUser requires the deployment's x-setup-key.
 */
export const PRE_ROUTER_UNAUTHENTICATED_WRITES: ReadonlyMap<string, APIGatewayProxyHandler> = new Map([
  ['POST /auth/setup', createAdminUserHandler],
]);

const router = createRouter(allRoutes);
const routeKeys = new Set(allRoutes.map((route) => `${route.method} ${route.resource}`));

function stripOfflinePrefix(value: string): string {
  if (value === OFFLINE_STAGE_PREFIX) return '/';
  if (value.startsWith(`${OFFLINE_STAGE_PREFIX}/`)) return value.slice(OFFLINE_STAGE_PREFIX.length);
  return value;
}

/**
 * Adapts a serverless-offline event to what API Gateway sends (plan 5.9).
 *
 * - Offline keeps the `/dev` stage prefix on event.path and event.resource;
 *   API Gateway does not. Strip it so the route table matches.
 * - Offline always fills requestContext.authorizer with a fake principal and
 *   no groups. Drop it so no handler sees that fake principal; dispatch then
 *   calls authenticate(), which installs the offline Admin context, as the
 *   gateway authorizer's offline bypass used to.
 *
 * Does nothing unless IS_OFFLINE is 'true'.
 */
export function normalizeOfflineEvent(event: APIGatewayProxyEvent): APIGatewayProxyEvent {
  if (process.env.IS_OFFLINE !== 'true') return event;
  if (event.path) event.path = stripOfflinePrefix(event.path);
  if (event.resource) event.resource = stripOfflinePrefix(event.resource);
  if (event.requestContext) delete event.requestContext.authorizer;
  return event;
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** The route template the router resolved, or null when it matched none. */
function matchedRouteKey(method: string, event: APIGatewayProxyEvent): string | null {
  const key = `${method} ${event.resource ?? ''}`;
  return routeKeys.has(key) ? key : null;
}

/**
 * One line per request. Unmatched requests log the method only, never the raw
 * path, so scanner traffic cannot inflate log cardinality (plan 5.5).
 */
function logRequest(route: string | null, method: string, status: number, startedAt: number): void {
  const ms = Date.now() - startedAt;
  const line = route === null
    ? { route: UNMATCHED_ROUTE, method, status, ms }
    : { route, status, ms };
  console.log(JSON.stringify(line));
}

export const handler: APIGatewayProxyHandler = async (
  incoming: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2],
): Promise<APIGatewayProxyResult> => {
  const startedAt = Date.now();
  const event = normalizeOfflineEvent(incoming);
  const method = (event.httpMethod || 'GET').toUpperCase();

  const preRouterKey = `${method} ${trimTrailingSlash(event.path || '')}`;
  const preRouterHandler = PRE_ROUTER_UNAUTHENTICATED_WRITES.get(preRouterKey);

  let status = 500;
  let route: string | null = preRouterHandler ? preRouterKey : null;
  try {
    const result = preRouterHandler
      ? ((await preRouterHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult)
      : ((await router(event, context, callback ?? noopCallback)) as APIGatewayProxyResult);
    status = result.statusCode;
    return result;
  } finally {
    if (!preRouterHandler) route = matchedRouteKey(method, event);
    logRequest(route, method, status, startedAt);
  }
};
