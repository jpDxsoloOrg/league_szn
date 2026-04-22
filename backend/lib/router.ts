import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from "aws-lambda";
import { methodNotAllowed, notFound, unauthorized } from "./response";
import { authenticate } from "./authenticate";

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type RouteConfig = {
    resource: string;
    method: HttpMethod;
    handler: APIGatewayProxyHandler;
    /**
     * When true, the router verifies the Cognito JWT from the Authorization
     * header and populates event.requestContext.authorizer before dispatching.
     * Further role checks (Admin / Moderator / Wrestler / Fantasy) remain the
     * handler's responsibility via requireRole / requireSuperAdmin.
     */
    requireAuth?: boolean;
};

type CompiledRoute = RouteConfig & {
    regex: RegExp;
    paramNames: string[];
};

const noopCallback = () => {};

export function createRouter(routes: ReadonlyArray<RouteConfig>): APIGatewayProxyHandler {
    const compiled: ReadonlyArray<CompiledRoute> = routes.map((route) => {
        const { regex, paramNames } = compileResource(route.resource);
        return { ...route, regex, paramNames };
    });
    const exactLookup = new Map<string, CompiledRoute>(
        compiled.map((r) => [toRouteKey(r.method, r.resource), r])
    );

    return async function (
        event: APIGatewayProxyEvent,
        context: Context,
        callback: Parameters<APIGatewayProxyHandler>[2]
    ): Promise<APIGatewayProxyResult> {
        const method = (event.httpMethod || 'GET').toUpperCase();
        const incomingResource = event.resource || '';

        // Fast path: API Gateway already resolved the route template in
        // event.resource (traditional per-http-event integration). Match it
        // exactly — this keeps existing domains that have not been migrated
        // to /{proxy+} working identically.
        const exact = exactLookup.get(toRouteKey(method, incomingResource));
        if (exact) {
            return dispatch(exact, event, context, callback);
        }
        // For legacy per-http-event integrations, event.resource is always a
        // concrete route template (no {proxy+}). If it isn't in our exact
        // lookup, the method is unsupported for that template. Preserve the
        // prior 405 behaviour without falling through to path matching, which
        // could misroute if event.path carries a stage prefix.
        if (!incomingResource.includes('{proxy+}')) {
            return methodNotAllowed();
        }

        // Fallback: path-regex matching. Used when the Lambda is invoked
        // behind a /{proxy+} route, where event.resource is something like
        // '/players/{proxy+}' and the actual routing must be derived from
        // event.path.
        const path = normalizePath(event.path || '');
        const pathMatches = compiled.filter((r) => r.regex.test(path));
        if (pathMatches.length === 0) return notFound();

        const methodMatches = pathMatches.filter((r) => r.method === method);
        if (methodMatches.length === 0) return methodNotAllowed();

        // Prefer the most specific match (fewest path parameters); ties go to
        // declaration order.
        const matched = methodMatches
            .map((r, i) => ({ r, i }))
            .sort((a, b) => a.r.paramNames.length - b.r.paramNames.length || a.i - b.i)[0].r;

        const execResult = matched.regex.exec(path);
        const existingParams = event.pathParameters || {};
        const pathParameters: Record<string, string> = {};
        for (const [k, v] of Object.entries(existingParams)) {
            if (typeof v === 'string') pathParameters[k] = v;
        }
        if (execResult) {
            matched.paramNames.forEach((name, i) => {
                const raw = execResult[i + 1];
                if (raw !== undefined) {
                    pathParameters[name] = safeDecode(raw);
                }
            });
        }
        event.pathParameters = pathParameters;
        event.resource = matched.resource;

        return dispatch(matched, event, context, callback);
    };
}

async function dispatch(
    route: CompiledRoute,
    event: APIGatewayProxyEvent,
    context: Context,
    callback: Parameters<APIGatewayProxyHandler>[2]
): Promise<APIGatewayProxyResult> {
    if (route.requireAuth) {
        const authResult = await authenticate(event);
        if (!authResult.ok) return unauthorized();
    }
    return (await route.handler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
}

function compileResource(resource: string): { regex: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    const PLACEHOLDER = '\x00';
    const withPlaceholders = resource.replace(/\{([^}]+)\}/g, (_, name: string) => {
        paramNames.push(name);
        return PLACEHOLDER;
    });
    const escaped = withPlaceholders.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.replace(new RegExp(PLACEHOLDER, 'g'), '([^/]+)');
    return { regex: new RegExp(`^${pattern}$`), paramNames };
}

function normalizePath(path: string): string {
    const withLead = path.startsWith('/') ? path : `/${path}`;
    if (withLead.length > 1 && withLead.endsWith('/')) return withLead.slice(0, -1);
    return withLead;
}

function toRouteKey(method: string | undefined, resource: string | undefined): string {
    const normalizedMethod = method?.toUpperCase() ?? 'GET';
    const normalizedResource = resource ?? '';
    return `${normalizedMethod} ${normalizedResource}`;
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
