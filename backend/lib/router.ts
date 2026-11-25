import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from "aws-lambda";
import { badRequest, methodNotAllowed, notFound, unauthorized } from "./response";
import { authenticate } from "./authenticate";
import { requireRole, type UserRole } from "./auth";
import { isCallerDeactivated } from "./accountStatus";

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Who may reach a route. Enforced in dispatch before the handler runs.
 *
 * - 'public': no caller check. Allowed on GET routes only.
 * - 'self-service': any verified caller. The handler applies its own role or
 *   ownership rules, so it must be read before a route is given this value.
 * - { roles }: a verified caller holding one of the roles.
 */
export type RouteAccess = 'public' | ProtectedAccess;
type ProtectedAccess = 'self-service' | RoleAccess;
type RoleAccess = { readonly roles: readonly UserRole[] };

/** Admin and Moderator: the same audience as the admin panel. */
export const STAFF: RoleAccess = { roles: ['Admin', 'Moderator'] };

/** Full Admin only. Used where the handler already excludes Moderators. */
export const ADMIN_ONLY: RoleAccess = { roles: ['Admin'] };

type RouteBase = {
    resource: string;
    handler: APIGatewayProxyHandler;
};

export type RouteConfig = RouteBase & (
    | { method: 'GET'; access: RouteAccess }
    | { method: Exclude<HttpMethod, 'GET'>; access: ProtectedAccess }
);

type CompiledRoute = RouteConfig & {
    regex: RegExp;
    paramNames: string[];
    /** Per path segment: true for a `{param}`, false for a literal. */
    paramSegments: boolean[];
};

const noopCallback = () => {};

/**
 * Longest path id we look up. Ids are UUIDs, and a key over DynamoDB's size
 * limit makes the query itself fail, which would otherwise surface as a 500.
 */
const MAX_PATH_PARAM_BYTES = 256;

/**
 * Longest query value we pass on. Handlers use ids from the query as DynamoDB
 * keys, which fail above their size limit (1024 bytes for a sort key). Paging
 * cursors are the longest real values, at a few hundred bytes.
 */
const MAX_QUERY_VALUE_BYTES = 1024;

const QUERY_VALUE_TOO_LONG = 'Query parameter value is too long';

export function createRouter(routes: ReadonlyArray<RouteConfig>): APIGatewayProxyHandler {
    routes.forEach(assertAccessDeclared);
    const compiled: ReadonlyArray<CompiledRoute> = routes.map((route) => {
        const { regex, paramNames } = compileResource(route.resource);
        return { ...route, regex, paramNames, paramSegments: toParamSegments(route.resource) };
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

        // Resource first, then method, as API Gateway does: pick the most
        // specific matching template regardless of method, then require the
        // method on that template. Falling back to a less specific sibling
        // would run, say, DELETE /players/{playerId} with playerId='me'.
        // Matches that share the winning template's literal/param shape all
        // match this path, so they are the same resource.
        const winner = pathMatches.reduce((best, r) => (compareSpecificity(r, best) < 0 ? r : best));
        const matched = pathMatches.find(
            (r) => r.method === method && compareSpecificity(r, winner) === 0
        );
        if (!matched) return methodNotAllowed();

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
    if (route.access !== 'public') {
        // A gateway authorizer has already verified the token and set the
        // caller's identity. Every other route verifies it here. The authorizer
        // response can be cached, so deactivation is checked here too, and it
        // has to be a 401: only that reaches the frontend's sign-out path.
        const gatewayPrincipal = event.requestContext.authorizer?.principalId as string | undefined;
        if (!gatewayPrincipal) {
            const authResult = await authenticate(event);
            if (!authResult.ok) return unauthorized();
        } else if (process.env.IS_OFFLINE !== 'true' && await isCallerDeactivated(event, gatewayPrincipal)) {
            return unauthorized();
        }
        if (route.access !== 'self-service') {
            const denied = requireRole(event, ...route.access.roles);
            if (denied) return denied;
        }
    }
    if (hasOverlongPathParam(event)) return notFound();
    if (hasOverlongQueryValue(event)) return badRequest(QUERY_VALUE_TOO_LONG);
    return (await route.handler(event, context, callback ?? noopCallback)) as APIGatewayProxyResult;
}

/** The router's query limit, for a handler deployed without a router. */
export function rejectOverlongQuery(handler: APIGatewayProxyHandler): APIGatewayProxyHandler {
    return async (event, context, callback) => {
        if (hasOverlongQueryValue(event)) return badRequest(QUERY_VALUE_TOO_LONG);
        return (await handler(event, context, callback)) as APIGatewayProxyResult;
    };
}

function hasOverlongQueryValue(event: APIGatewayProxyEvent): boolean {
    return Object.values(event.queryStringParameters ?? {}).some(
        (value) => value !== undefined && Buffer.byteLength(value) > MAX_QUERY_VALUE_BYTES
    );
}

function hasOverlongPathParam(event: APIGatewayProxyEvent): boolean {
    return Object.entries(event.pathParameters ?? {}).some(
        // `proxy` is the whole path; the ids inside it are checked by name.
        ([name, value]) => name !== 'proxy' && value !== undefined
            && Buffer.byteLength(value) > MAX_PATH_PARAM_BYTES
    );
}

/** Fails at load time so that a route can never ship without a declaration. */
function assertAccessDeclared(route: RouteConfig): void {
    const access: RouteAccess | undefined = route.access;
    const label = `${route.method} ${route.resource}`;
    if (access === undefined) {
        throw new Error(`Route ${label} has no access declaration`);
    }
    if (access === 'public' && route.method !== 'GET') {
        throw new Error(`Route ${label} cannot be public: only GET routes can`);
    }
    if (typeof access === 'object' && access.roles.length === 0) {
        throw new Error(`Route ${label} declares an empty role list`);
    }
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

function toParamSegments(resource: string): boolean[] {
    return resource.split('/').filter((segment) => segment !== '')
        .map((segment) => /^\{[^}]+\}$/.test(segment));
}

/**
 * API Gateway's precedence for two templates that match the same path: walk
 * the segments left to right, and at the first one where they differ, the
 * literal wins over the `{param}`. Negative when `a` is more specific, 0 when
 * the shapes are identical (the reduce above then keeps the earlier route).
 * Templates have no greedy params, so matching templates have the same
 * segment count; a shorter one is ranked first only as a defensive default.
 */
function compareSpecificity(a: CompiledRoute, b: CompiledRoute): number {
    const length = Math.min(a.paramSegments.length, b.paramSegments.length);
    for (let i = 0; i < length; i++) {
        if (a.paramSegments[i] !== b.paramSegments[i]) return a.paramSegments[i] ? 1 : -1;
    }
    return a.paramSegments.length - b.paramSegments.length;
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
