import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRouter, type RouteAccess, type RouteConfig } from '../../lib/router';

vi.mock('../../lib/authenticate', () => ({
  authenticate: async () => ({ ok: false }),
}));

const functionsDir = join(__dirname, '..');
const serverlessPath = join(functionsDir, '..', 'serverless.yml');

/** handler.ts files with no route table. Each is listed with its reason. */
const NO_ROUTE_TABLE = new Set([
  'activity/handler.ts', // One public GET; rejects every other method itself.
]);

/**
 * Non-GET routes open to callers outside the staff roles. Each handler applies
 * its own role or ownership rules, so read it before adding to this list.
 */
const SELF_SERVICE_WRITES = new Set([
  'POST /challenges',
  'POST /challenges/{challengeId}/respond',
  'POST /challenges/{challengeId}/cancel',
  'POST /events/{eventId}/check-in',
  'DELETE /events/{eventId}/check-in',
  'POST /matches/{matchId}/slots/{slotId}/claim',
  'DELETE /matches/{matchId}/slots/{slotId}/claim',
  'POST /matches/{matchId}/ratings',
  'POST /matchmaking/heartbeat',
  'DELETE /matchmaking/presence',
  'POST /matchmaking/queue/join',
  'POST /matchmaking/queue/leave',
  'POST /matchmaking/invite',
  'POST /matchmaking/invitations/{invitationId}/accept',
  'POST /matchmaking/invitations/{invitationId}/decline',
  'PUT /notifications/{notificationId}/read',
  'PUT /notifications/mark-all-read',
  'DELETE /notifications/delete-read',
  'DELETE /notifications/{notificationId}',
  'PUT /players/me/overall',
  'PUT /players/me',
  'POST /promos',
  'POST /promos/{promoId}/react',
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
  'GET /admin/users',
  'POST /admin/users/role',
  'POST /admin/users/toggle-enabled',
  'POST /admin/users/delete',
  'POST /admin/users/sync-roles',
  'DELETE /challenges/{challengeId}',
  'POST /challenges/bulk-delete',
  'DELETE /stables/{stableId}',
  'DELETE /tag-teams/{tagTeamId}',
]);

/** The audit's unprotected routes: these must stay closed to non-staff. */
const STAFF_ROUTES = [
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
];

type TableEntry = { file: string; route: RouteConfig; key: string };
type GatewayEvent = { handlerFile: string; path: string; method: string; hasAuthorizer: boolean };

function findHandlerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : findHandlerFiles(fullPath);
    return entry.name === 'handler.ts' ? [fullPath] : [];
  });
}

/** Reads the http events of each routed function out of serverless.yml. */
function parseGatewayEvents(): GatewayEvent[] {
  const events: GatewayEvent[] = [];
  let handlerFile = '';
  let current: GatewayEvent | null = null;
  for (const line of readFileSync(serverlessPath, 'utf8').split('\n')) {
    const handlerLine = /^ {4}handler: functions\/(.+\/handler)\.handler\s*$/.exec(line);
    const otherHandlerLine = /^ {4}handler: /.test(line);
    const pathLine = /^ {10}path: (\S+)\s*$/.exec(line);
    const methodLine = /^ {10}method: (\S+)\s*$/.exec(line);
    if (otherHandlerLine) {
      handlerFile = handlerLine ? `${handlerLine[1]}.ts` : '';
      current = null;
    }
    if (pathLine && handlerFile) {
      current = { handlerFile, path: `/${pathLine[1]}`, method: '', hasAuthorizer: false };
      events.push(current);
    }
    if (methodLine && current) current.method = methodLine[1].toUpperCase();
    if (/^ {10}authorizer: adminAuthorizer/.test(line) && current) current.hasAuthorizer = true;
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

describe('route access declarations', () => {
  const entries: TableEntry[] = [];
  const handlerFiles = findHandlerFiles(functionsDir);

  beforeAll(async () => {
    for (const fullPath of handlerFiles) {
      const file = relative(functionsDir, fullPath);
      if (NO_ROUTE_TABLE.has(file)) continue;
      const loaded = (await import(/* @vite-ignore */ fullPath)) as { routes?: ReadonlyArray<RouteConfig> };
      if (!loaded.routes) throw new Error(`${file} does not export a route table`);
      for (const route of loaded.routes) {
        entries.push({ file, route, key: `${route.method} ${route.resource}` });
      }
    }
  }, 60000);

  it('finds every route table', () => {
    expect(handlerFiles.length).toBeGreaterThanOrEqual(30);
    expect(new Set(entries.map((entry) => entry.file)).size).toBe(handlerFiles.length - NO_ROUTE_TABLE.size);
  });

  it('gives every route a valid declaration, with no public writes', () => {
    for (const { key, route } of entries) {
      const access: RouteAccess | undefined = route.access;
      expect(access, key).toBeDefined();
      if (route.method !== 'GET') expect(access, key).not.toBe('public');
    }
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
      const entry = entries.find((candidate) => candidate.key === key);
      expect(entry, key).toBeDefined();
      expect(asRoles(entry!.route.access), key).toEqual(['Admin', 'Moderator']);
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
      expect(wrestler, entry.key).toEqual({ statusCode: 403, reached: false });
      expect(noGroups, entry.key).toEqual({ statusCode: 403, reached: false });
      expect(moderator.reached, entry.key).toBe(asRoles(access).includes('Moderator'));
    }
  });

  it('matches every gateway event to a route', () => {
    const gatewayEvents = parseGatewayEvents();
    expect(gatewayEvents.length).toBeGreaterThan(100);
    for (const { handlerFile, path, method } of gatewayEvents) {
      const label = `${method} ${path} in ${handlerFile}`;
      if (NO_ROUTE_TABLE.has(handlerFile)) continue;
      const matches = entries.filter(
        ({ file, route }) =>
          file === handlerFile && route.resource === path && (method === 'ANY' || route.method === method),
      );
      expect(matches.length, label).toBeGreaterThan(0);
    }
  });

  it('never marks a route public behind the gateway authorizer', () => {
    for (const { handlerFile, path, method, hasAuthorizer } of parseGatewayEvents()) {
      if (!hasAuthorizer || NO_ROUTE_TABLE.has(handlerFile)) continue;
      const route = entries.find(
        (entry) => entry.file === handlerFile && entry.route.resource === path && entry.route.method === method,
      );
      expect(route?.route.access, `${method} ${path}`).not.toBe('public');
    }
  });
});
