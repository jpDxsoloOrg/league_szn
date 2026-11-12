import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { createRouter, type RouteConfig } from '../../lib/router';
import { success } from '../../lib/response';
import { recomputeRoutes, handleDirectInvoke, type ProgressionRecomputePayload } from './routes/recompute';
import { readRoutes } from './routes/read';
import { considerationRoutes } from './routes/consideration';
import { executeRoutes } from './routes/execute';

const noopCallback = () => {};

/**
 * Single Lambda for progression (Young Boys call-ups, division movement).
 * Each ticket owns one routes file under ./routes so parallel work doesn't
 * collide in this router.
 */
export const routes: ReadonlyArray<RouteConfig> = [
  ...recomputeRoutes,
  ...readRoutes,
  ...considerationRoutes,
  ...executeRoutes,
];

const router = createRouter(routes);

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> => {
  // API Gateway always sets requestContext; its absence means a direct async
  // invocation from another function (a progression recompute request).
  if (event.requestContext == null) {
    await handleDirectInvoke(event as unknown as ProgressionRecomputePayload);
    return success({ ok: true });
  }

  return (await router(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
};
