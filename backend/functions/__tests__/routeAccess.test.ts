/**
 * Access rules for the merged route table served by the single `api` Lambda
 * (INFRA-207). Since deploy 2a, serverless.yml has one http event, ANY
 * /{proxy+} on `api`, and every route is authorized in code by lib/router
 * dispatch, so the merged table in functions/api/routes.ts is the source of
 * truth here, not the serverless.yml events.
 * See docs/plans/plan-infra-207-api-simplification.md section 5.10.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRouter, type RouteAccess, type RouteConfig } from '../../lib/router';
import { PRE_ROUTER_UNAUTHENTICATED_WRITES } from '../api/handler';
import { allRoutes } from '../api/routes';
import { concretePath, gatewayResource } from '../api/__tests__/gatewayRouting';
import legacyGatewayRoutes from '../api/__tests__/legacyGatewayRoutes.json';

vi.mock('../../lib/authenticate', async () => {
  const { presetCallerAuthenticate } = await import('../../lib/__tests__/presetCallerAuth');
  return { authenticate: presetCallerAuthenticate(async () => ({ ok: false })) };
});

const functionsDir = join(__dirname, '..');
const serverlessPath = join(functionsDir, '..', 'serverless.yml');

/** handler.ts files with no route table. Each is listed with its reason. */
const NO_ROUTE_TABLE = new Set([
  'activity/handler.ts', // One public GET; rejects every other method itself.
  'api/handler.ts', // merged table; checked in api/__tests__ (INFRA-207).
]);

/**
 * Every route open without a token (INFRA-207). Generated from the route
 * tables when the gateway authorizer was retired, then reviewed. A new or
 * changed public route needs a reviewed edit here.
 */
const PUBLIC_ROUTES = new Set([
  // Domain route tables
  'GET /site-config',
  'GET /economy/catalog',
  'GET /players',
  'GET /players/{playerId}',
  'GET /players/{playerId}/statistics',
  'GET /builds/rules',
  'GET /players/{playerId}/build',
  'GET /matches',
  'GET /championships',
  'GET /championships/{championshipId}/history',
  'GET /tournaments',
  'GET /dashboard',
  'GET /ticker',
  'GET /seasons',
  'GET /seasons/{seasonId}/awards',
  'GET /companies',
  'GET /companies/{companyId}',
  'GET /shows',
  'GET /shows/{showId}',
  'GET /locations',
  'GET /locations/{locationId}',
  'GET /divisions',
  'GET /wrestlers',
  'GET /wrestlers/{wrestlerId}',
  'GET /stipulations',
  'GET /match-types',
  'GET /events',
  'GET /events/{eventId}',
  'GET /events/{eventId}/commentary',
  'GET /championships/{championshipId}/contenders',
  'GET /progression/players/{playerId}',
  'GET /progression/tracks',
  'GET /progression/considerations',
  'GET /progression/players/{playerId}/history',
  'GET /rivalry-requests',
  'GET /rivalry-requests/{rivalryId}',
  'GET /players/{playerId}/contract',
  'GET /free-agents',
  'GET /players/{playerId}/injuries',
  'GET /challenges',
  'GET /challenges/{challengeId}',
  'GET /promos',
  'GET /promos/{promoId}',
  'GET /stables',
  'GET /stables/standings',
  'GET /stables/{stableId}',
  'GET /stables/{stableId}/stats',
  'GET /stables/{stableId}/schedule',
  'GET /stables/{stableId}/promos',
  'GET /tag-teams',
  'GET /tag-teams/standings',
  'GET /tag-teams/{tagTeamId}',
  'GET /videos',
  'GET /videos/{videoId}',
  'GET /episodes',
  'GET /episodes/{episodeId}',
  'GET /live-stream',
  'GET /announcements/active',
  // LEGACY_ENTRY_ROUTES in api/routes.ts (entry points without a route table)
  'GET /standings',
  'GET /activity',
  'GET /statistics',
  'GET /rivalries',
  'GET /rivalries/activity',
  'GET /api-docs',
  'GET /api-docs/spec',
]);

/**
 * Non-GET routes open to callers outside the staff roles. Each handler applies
 * its own role or ownership rules, so read it before adding to this list.
 */
const SELF_SERVICE_WRITES = new Set([
  'POST /challenges',
  'POST /challenges/{challengeId}/respond',
  'POST /challenges/{challengeId}/cancel',
  // ECO-04: the handlers allow only the player the offer was made to.
  'POST /contracts/{contractId}/accept',
  'POST /contracts/{contractId}/decline',
  'POST /events/{eventId}/check-in',
  'DELETE /events/{eventId}/check-in',
  'POST /matches/{matchId}/slots/{slotId}/claim',
  'DELETE /matches/{matchId}/slots/{slotId}/claim',
  'POST /matches/{matchId}/ratings',
  'PUT /notifications/{notificationId}/read',
  'PUT /notifications/mark-all-read',
  'DELETE /notifications/delete-read',
  'DELETE /notifications/{notificationId}',
  'PUT /players/me/overall',
  'PUT /players/me',
  'PUT /players/me/build', // BLD-03: the handler requires the Wrestler role and saves only the caller's player.
  'POST /promos',
  'POST /promos/{promoId}/react',
  'POST /shop/purchase', // ECO-08
  'POST /shop/gm-interference', // ECO-09
  'PUT /rivalry-requests/{rivalryId}',
  'POST /rivalries/{rivalryId}/messages',
  'POST /rivalries/{rivalryId}/notes',
  'DELETE /rivalries/{rivalryId}/notes/{noteId}',
  'POST /stables',
  'PUT /stables/{stableId}',
  'POST /stables/{stableId}/invitations',
  'POST /stables/{stableId}/invitations/{invitationId}/respond',
  'POST /stables/{stableId}/disband',
  'POST /stables/{stableId}/remove-member',
  'POST /stables/{stableId}/messages',
  'POST /stables/{stableId}/direct-messages',
  'POST /storyline-requests',
  'POST /tag-teams',
  'PUT /tag-teams/{tagTeamId}',
  'POST /tag-teams/{tagTeamId}/respond',
  'POST /tag-teams/{tagTeamId}/dissolve',
  'POST /transfers',
  'POST /admin/videos',
]);

/** Routes the handlers already restrict to full Admin. Nothing was moved here. */
const ADMIN_ONLY_ROUTES = new Set([
  'PUT /admin/site-config',
  'DELETE /admin/clear-all',
  'POST /admin/seed-data',
  'GET /admin/export-data',
  'GET /admin/heat-config',
  'PUT /admin/heat-config',
  'PUT /admin/economy-config',
  'PUT /admin/injury-config', // INJ-01
  'POST /admin/injury-recovery', // INJ-05
  'GET /admin/users',
  'POST /admin/users/role',
  'POST /admin/users/toggle-enabled',
  'POST /admin/users/delete',
  'POST /admin/users/sync-roles',
  'POST /admin/users/bulk',
  'DELETE /challenges/{challengeId}',
  'POST /challenges/bulk-delete',
  'DELETE /stables/{stableId}',
  'DELETE /tag-teams/{tagTeamId}',
  'POST /players/{playerId}/strikes',
  'POST /players/{playerId}/strikes/{strikeId}/remove',
  'POST /players/{playerId}/reactivate',
  'POST /players/{playerId}/ledger/adjust',
]);

/** The audit's unprotected routes: these must stay closed to non-staff. */
const STAFF_ROUTES = [
  'GET /players/{playerId}/discipline',
  'POST /championships',
  'PUT /championships/{championshipId}',
  'DELETE /championships/{championshipId}',
  'POST /championships/{championshipId}/vacate',
  'POST /championships/{championshipId}/assign',
  'POST /companies',
  'PUT /companies/{companyId}',
  'DELETE /companies/{companyId}',
  'POST /events',
  'PUT /events/{eventId}',
  'DELETE /events/{eventId}',
  'POST /match-types',
  'PUT /match-types/{matchTypeId}',
  'DELETE /match-types/{matchTypeId}',
  'POST /matches',
  'PUT /matches/{matchId}/result',
  'PUT /matches/{matchId}',
  // ECO-07
  'POST /matches/{matchId}/no-show',
  'DELETE /matches/{matchId}/no-show/{playerId}',
  // BLD-08: GM preview sim, no writes
  'POST /simulate',
  // BLD-10: official sim, records the result
  'POST /matches/{matchId}/simulate',
  'POST /players/{playerId}/fines',
  'POST /fines/{entryId}/rescind',
  // ECO-14
  'GET /players/{playerId}/ledger',

  // INJ-08
  'GET /injuries',
  'POST /players/{playerId}/injuries',
  'POST /players/{playerId}/injuries/heal',
  'PATCH /players/{playerId}/injuries/current',
  'PATCH /players/{playerId}/stamina',

  'POST /players',
  'DELETE /players/{playerId}',
  'POST /shows',
  'PUT /shows/{showId}',
  'DELETE /shows/{showId}',
  'POST /wrestlers/import',
  'POST /wrestlers/reset-assignments',
  'POST /wrestlers',
  'PUT /wrestlers/{wrestlerId}',
  'DELETE /wrestlers/{wrestlerId}',
  // ECO-09
  'GET /gm-interference',
  'POST /gm-interference/{requestId}/resolve',
  'POST /admin/contenders/recalculate',
  'GET /admin/contenders/overrides',
  'POST /admin/contenders/overrides',
  'DELETE /admin/contenders/overrides/{championshipId}/{playerId}',
  'POST /divisions',
  'PUT /divisions/{divisionId}',
  'DELETE /divisions/{divisionId}',
  'POST /locations',
  'POST /locations/bulk',
  'PUT /locations/{locationId}',
  'DELETE /locations/{locationId}',
  'POST /seasons',
  'PUT /seasons/{seasonId}',
  'DELETE /seasons/{seasonId}',
  'POST /seasons/{seasonId}/awards',
  'DELETE /seasons/{seasonId}/awards/{awardId}',
  'POST /stipulations',
  'PUT /stipulations/{stipulationId}',
  'DELETE /stipulations/{stipulationId}',
  'POST /tournaments',
  'PUT /tournaments/{tournamentId}',
  'GET /admin/episodes',
  'POST /admin/episodes',
  'POST /admin/episodes/youtube-lookup',
  'PUT /admin/episodes/{episodeId}',
  'DELETE /admin/episodes/{episodeId}',
  'PUT /admin/live-stream',
];

type TableEntry = { route: RouteConfig; key: string };
type HttpEvent = { functionName: string; path: string; method: string; hasAuthorizer: boolean };
type LegacyGatewayRoute = { method: string; path: string; hasAuthorizer: boolean };

function findHandlerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : findHandlerFiles(fullPath);
    return entry.name === 'handler.ts' ? [fullPath] : [];
  });
}

/** Every http event in serverless.yml, with the function that declares it. */
function parseHttpEvents(): HttpEvent[] {
  const events: HttpEvent[] = [];
  let functionName = '';
  let current: HttpEvent | null = null;
  for (const line of readFileSync(serverlessPath, 'utf8').split('\n')) {
    const functionLine = /^ {2}([A-Za-z0-9]+):\s*$/.exec(line);
    if (functionLine) {
      functionName = functionLine[1];
      current = null;
    }
    if (/^\s*- http:/.test(line)) {
      current = { functionName, path: '', method: '', hasAuthorizer: false };
      events.push(current);
      continue;
    }
    if (!current) continue;
    const pathLine = /^ {10}path: (\S+)\s*$/.exec(line);
    const methodLine = /^ {10}method: (\S+)\s*$/.exec(line);
    if (pathLine) current.path = pathLine[1];
    if (methodLine) current.method = methodLine[1].toUpperCase();
    if (/^\s+authorizer:/.test(line)) current.hasAuthorizer = true;
    if (/^ {0,9}\S/.test(line) && !/^\s*- http:/.test(line)) current = null;
  }
  return events;
}

const ctx = {} as Context;
const cb = (() => {}) as Callback<APIGatewayProxyResult>;

async function callRoute(
  entry: TableEntry,
  authorizer: Record<string, string> | undefined,
): Promise<{ statusCode: number | undefined; reached: boolean }> {
  const inner = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
  const router = createRouter([{ ...entry.route, handler: inner } as RouteConfig]);
  const event = {
    httpMethod: entry.route.method,
    resource: entry.route.resource,
    path: entry.route.resource,
    headers: {},
    requestContext: { authorizer },
  } as unknown as APIGatewayProxyEvent;
  const result = await router(event, ctx, cb);
  return { statusCode: result?.statusCode, reached: inner.mock.calls.length === 1 };
}

const asRoles = (access: RouteAccess) => (typeof access === 'object' ? [...access.roles].sort() : []);
const caller = (groups: string) => ({ principalId: 'sub-1', groups });

const entries: TableEntry[] = allRoutes.map((route) => ({ route, key: `${route.method} ${route.resource}` }));
const routeByKey = new Map(entries.map((entry) => [entry.key, entry.route]));
const templates = [...new Set(allRoutes.map((route) => route.resource))];

/**
 * The merged-table route that serves `method path` through /{proxy+}, picked
 * the way API Gateway picks a resource (routes.test.ts proves the router
 * agrees with this model), or undefined when none does.
 */
function servingRoute(method: string, path: string): RouteConfig | undefined {
  const resource = gatewayResource(templates, concretePath(path));
  return resource === null ? undefined : routeByKey.get(`${method} ${resource}`);
}

describe('serverless.yml http events', () => {
  it('has exactly one http event: ANY /{proxy+} on api, with no gateway authorizer', () => {
    expect(parseHttpEvents()).toEqual([
      { functionName: 'api', path: '/{proxy+}', method: 'ANY', hasAuthorizer: false },
    ]);
  });

  it('declares no httpApi events either', () => {
    expect(readFileSync(serverlessPath, 'utf8')).not.toMatch(/^\s*- httpApi:/m);
  });
});

describe('route access declarations', () => {
  const handlerFiles = findHandlerFiles(functionsDir);
  const tables = new Map<string, ReadonlyArray<RouteConfig>>();

  beforeAll(async () => {
    for (const fullPath of handlerFiles) {
      const file = relative(functionsDir, fullPath);
      if (NO_ROUTE_TABLE.has(file)) continue;
      const loaded = (await import(/* @vite-ignore */ fullPath)) as { routes?: ReadonlyArray<RouteConfig> };
      if (!loaded.routes) throw new Error(`${file} does not export a route table`);
      tables.set(file, loaded.routes);
    }
  }, 60000);

  it('serves every domain route table through the merged table', () => {
    expect(handlerFiles.length).toBeGreaterThanOrEqual(30);
    expect(tables.size).toBe(handlerFiles.length - NO_ROUTE_TABLE.size);
    const merged = new Set(allRoutes);
    for (const [file, routes] of tables) {
      for (const route of routes) {
        expect(merged.has(route), `${route.method} ${route.resource} in ${file}`).toBe(true);
      }
    }
  });

  it('gives every route a valid declaration, with no public writes', () => {
    for (const { key, route } of entries) {
      const access: RouteAccess | undefined = route.access;
      expect(access, key).toBeDefined();
      if (route.method !== 'GET') expect(access, key).not.toBe('public');
    }
  });

  it('opens exactly the reviewed PUBLIC_ROUTES without a token', () => {
    const publicKeys = entries.filter(({ route }) => route.access === 'public').map(({ key }) => key);
    expect(new Set(publicKeys)).toEqual(PUBLIC_ROUTES);
    expect(publicKeys.length).toBe(PUBLIC_ROUTES.size);
  });

  it('allows no unauthenticated write except the pre-router allowlist', () => {
    expect([...PRE_ROUTER_UNAUTHENTICATED_WRITES.keys()]).toEqual(['POST /auth/setup']);
    // The allowlisted write is handled before the router and is not in the table.
    for (const key of PRE_ROUTER_UNAUTHENTICATED_WRITES.keys()) expect(routeByKey.has(key), key).toBe(false);
    // The RouteConfig type already forbids it; this catches a cast that slips past.
    const openWrites = entries.filter(
      ({ route }) => route.method !== 'GET' && (route.access as RouteAccess) === 'public',
    );
    expect(openWrites.map(({ key }) => key)).toEqual([]);
  });

  it('keeps every non-GET route either role-gated or on the self-service list', () => {
    const openWrites = entries
      .filter(({ route }) => route.method !== 'GET' && route.access === 'self-service')
      .map(({ key }) => key);
    expect(new Set(openWrites)).toEqual(SELF_SERVICE_WRITES);
  });

  it('restricts to full Admin only the routes whose handlers already do', () => {
    const adminOnly = entries
      .filter(({ route }) => asRoles(route.access).join() === 'Admin')
      .map(({ key }) => key);
    expect(new Set(adminOnly)).toEqual(ADMIN_ONLY_ROUTES);
  });

  it('declares every audited route as Admin plus Moderator', () => {
    for (const key of STAFF_ROUTES) {
      const route = routeByKey.get(key);
      expect(route, key).toBeDefined();
      expect(asRoles(route!.access), key).toEqual(['Admin', 'Moderator']);
    }
  });

  it('enforces each declaration in dispatch', async () => {
    for (const entry of entries) {
      const { access } = entry.route;
      const anonymous = await callRoute(entry, undefined);
      const wrestler = await callRoute(entry, caller('Wrestler'));
      const noGroups = await callRoute(entry, caller(''));
      const moderator = await callRoute(entry, caller('Moderator'));
      const admin = await callRoute(entry, caller('Admin'));

      expect(admin.reached, entry.key).toBe(true);
      if (access === 'public') {
        expect(anonymous.reached, entry.key).toBe(true);
        continue;
      }
      expect(anonymous, entry.key).toEqual({ statusCode: 401, reached: false });
      if (access === 'self-service') {
        expect(wrestler.reached, entry.key).toBe(true);
        expect(noGroups.reached, entry.key).toBe(true);
        expect(moderator.reached, entry.key).toBe(true);
        continue;
      }
      const roles = asRoles(access);
      // hasRole: Moderator passes any check that does not require Admin.
      if (roles.includes('Wrestler')) expect(wrestler.reached, entry.key).toBe(true);
      else expect(wrestler, entry.key).toEqual({ statusCode: 403, reached: false });
      expect(noGroups, entry.key).toEqual({ statusCode: 403, reached: false });
      expect(moderator.reached, entry.key).toBe(roles.some((role) => role !== 'Admin'));
    }
  });

  it('serves every discipline route, none of them public', () => {
    const discipline = [
      'GET /players/{playerId}/discipline',
      'POST /players/{playerId}/reactivate',
      'POST /players/{playerId}/strikes',
      'POST /players/{playerId}/strikes/{strikeId}/remove',
    ];
    for (const key of discipline) {
      const [method, path] = key.split(' ');
      const route = servingRoute(method, path);
      expect(route && `${route.method} ${route.resource}`, key).toBe(key);
      expect(route?.access, key).not.toBe('public');
    }
  });

  it('keeps every formerly gateway-authorized route non-public', () => {
    const authorized = (legacyGatewayRoutes as LegacyGatewayRoute[]).filter((route) => route.hasAuthorizer);
    expect(authorized.length).toBe(57);
    for (const { method, path } of authorized) {
      const methods = method === 'ANY' ? ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] : [method];
      const served = methods.map((candidate) => servingRoute(candidate, path)).filter(Boolean);
      expect(served.length, `${method} ${path}`).toBeGreaterThan(0);
      for (const route of served) {
        expect(route?.access, `${route?.method} ${route?.resource} (was ${method} ${path})`).not.toBe('public');
      }
    }
  });
});
