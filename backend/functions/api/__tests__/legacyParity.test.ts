import type { APIGatewayProxyEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { PRE_ROUTER_UNAUTHENTICATED_WRITES } from '../handler';
import { allRoutes } from '../routes';
import { concretePath, createProbeRouter, routeKey } from './gatewayRouting';
import legacyGatewayRoutes from './legacyGatewayRoutes.json';

vi.mock('../../../lib/authenticate', () => ({
  authenticate: async (event: APIGatewayProxyEvent) => {
    event.requestContext.authorizer = { principalId: 'sub-admin', username: 'admin', email: '', groups: 'Admin' };
    return { ok: true };
  },
}));
vi.mock('../../../lib/accountStatus', () => ({
  isCallerDeactivated: async () => false,
}));

type LegacyGatewayRoute = { method: string; path: string; hasAuthorizer: boolean };

/**
 * Gateway routes deliberately dropped by INFRA-207. POST /auth/login had no
 * traffic in 90 days and the frontend signs in through Cognito directly.
 */
const DELETED_ON_PURPOSE = new Set(['POST /auth/login']);

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const fixture = legacyGatewayRoutes as LegacyGatewayRoute[];
const probe = createProbeRouter(allRoutes);
const routesByKey = new Map(allRoutes.map((route) => [routeKey(route), route]));

/** The merged-table routes that serve a legacy gateway event at its own template. */
async function servingRoutes({ method, path }: LegacyGatewayRoute): Promise<string[]> {
  const methods = method === 'ANY' ? HTTP_METHODS : [method];
  const served: string[] = [];
  for (const candidate of methods) {
    const result = await probe(candidate, concretePath(path));
    if (result.ranRoute === `${candidate} ${path}`) served.push(result.ranRoute);
  }
  return served;
}

describe('legacy gateway route parity', () => {
  it('holds every http event serverless.yml declared before the cut-over', () => {
    expect(fixture.length).toBe(209);
    expect(fixture.filter((route) => route.hasAuthorizer).length).toBe(57);
  });

  it('serves every pre-migration gateway route from the merged table', async () => {
    const missing: string[] = [];
    for (const legacy of fixture) {
      const key = `${legacy.method} ${legacy.path}`;
      if (DELETED_ON_PURPOSE.has(key) || PRE_ROUTER_UNAUTHENTICATED_WRITES.has(key)) continue;
      // For ANY, at least one method must resolve.
      if ((await servingRoutes(legacy)).length === 0) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it('serves POST /auth/setup before the router', () => {
    expect(fixture).toContainEqual({ method: 'POST', path: '/auth/setup', hasAuthorizer: false });
    expect(PRE_ROUTER_UNAUTHENTICATED_WRITES.has('POST /auth/setup')).toBe(true);
    expect([...PRE_ROUTER_UNAUTHENTICATED_WRITES.keys()]).toEqual(['POST /auth/setup']);
  });

  it('drops only the routes deleted on purpose', () => {
    for (const key of DELETED_ON_PURPOSE) {
      const [method, path] = key.split(' ');
      expect(fixture, key).toContainEqual(expect.objectContaining({ method, path }));
      expect(routesByKey.has(key), key).toBe(false);
    }
  });

  it('keeps every formerly gateway-authorized route non-public', async () => {
    for (const legacy of fixture.filter((route) => route.hasAuthorizer)) {
      for (const key of await servingRoutes(legacy)) {
        expect(routesByKey.get(key)?.access, key).not.toBe('public');
      }
    }
  });
});
