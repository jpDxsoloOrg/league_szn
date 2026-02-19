import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from "aws-lambda";
import { methodNotAllowed } from "./response";

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type RouteConfig = {
    resource: string;
    method: HttpMethod;
    handler: APIGatewayProxyHandler;
}

const noopCallback = () => {};
export function createRouter(routes: ReadonlyArray<RouteConfig>): APIGatewayProxyHandler { 
    const routesMap = new Map<string, APIGatewayProxyHandler>(routes.map(route => [toRouteKey(route.method, route.resource), route.handler]));
    return async function(event: APIGatewayProxyEvent, context: Context, callback: Parameters<APIGatewayProxyHandler>[2]): Promise<APIGatewayProxyResult> {
        const routeKey = toRouteKey(event.httpMethod, event.resource);
        const matchedHandler = routesMap.get(routeKey);
        if (matchedHandler) {
            return (await matchedHandler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
        }
        return methodNotAllowed();
    }
}

function toRouteKey(method: string | undefined, resource: string | undefined): string {
    const normalizedMethod = method?.toUpperCase() ?? 'GET';
    const normalizedResource = resource ?? '';
    return `${normalizedMethod} ${normalizedResource}`;
}


