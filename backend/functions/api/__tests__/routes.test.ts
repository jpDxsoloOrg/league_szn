import type { APIGatewayProxyEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createRouter } from '../../../lib/router';
import { allRoutes, LEGACY_ENTRY_ROUTES } from '../routes';
import {
  compareGatewaySpecificity,
  concretePath,
  createProbeRouter,
  gatewayResource,
  routeKey,
  shapeOf,
  unifyTemplates,
} from './gatewayRouting';

// Every probe is an authenticated Admin, so access rules never mask which route ran.
vi.mock('../../../lib/authenticate', () => ({
  authenticate: async (event: APIGatewayProxyEvent) => {
    event.requestContext.authorizer = { principalId: 'sub-admin', username: 'admin', email: '', groups: 'Admin' };
    return { ok: true };
  },
}));
vi.mock('../../../lib/accountStatus', () => ({
  isCallerDeactivated: async () => false,
}));

const probe = createProbeRouter(allRoutes);
const templates = [...new Set(allRoutes.map((route) => route.resource))];
const routesByKey = new Map(allRoutes.map((route) => [routeKey(route), route]));
const methodsOf = (template: string): string[] =>
  allRoutes.filter((route) => route.resource === template).map((route) => route.method);

/** Every unordered pair of distinct items. */
function pairsOf<T>(items: ReadonlyArray<T>): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) pairs.push([items[i], items[j]]);
  }
  return pairs;
}

/** What API Gateway would do with `method path` given the merged table's resources. */
function gatewayOutcome(method: string, path: string): { statusCode: number; ranRoute: string | null } {
  const resource = gatewayResource(templates, path);
  if (resource === null) return { statusCode: 404, ranRoute: null };
  const key = `${method} ${resource}`;
  return routesByKey.has(key) ? { statusCode: 200, ranRoute: key } : { statusCode: 405, ranRoute: null };
}

describe('merged api route table', () => {
  it('loads every route, with an access declaration on each', () => {
    expect(() => createRouter(allRoutes)).not.toThrow();
    expect(allRoutes.length).toBeGreaterThan(250);
  });

  it('includes the legacy entry points', () => {
    for (const route of LEGACY_ENTRY_ROUTES) {
      expect(routesByKey.get(routeKey(route)), routeKey(route)).toBe(route);
    }
  });

  it('has no duplicate method and resource pairs', () => {
    const keys = allRoutes.map(routeKey);
    const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i);
    expect(duplicates).toEqual([]);
  });

  it('has no two resources API Gateway would see as the same path', () => {
    // `/a/{x}` beside `/a/{y}` is a true tie: API Gateway refuses sibling params
    // with different names, and the router would fall back to declaration order.
    const ties = pairsOf(templates)
      .filter(([first, second]) => shapeOf(first) === shapeOf(second))
      .map(([first, second]) => `${first} ~ ${second}`);
    expect(ties).toEqual([]);
  });

  it('reaches every route through /{proxy+} at its own concrete path', async () => {
    const unreachable: string[] = [];
    for (const route of allRoutes) {
      const result = await probe(route.method, concretePath(route.resource));
      if (result.ranRoute !== routeKey(route)) {
        unreachable.push(`${routeKey(route)} -> ${result.ranRoute ?? result.statusCode}`);
      }
    }
    expect(unreachable).toEqual([]);
  });

  it('picks the same route as API Gateway for every overlapping same-method pair', async () => {
    const mismatches: string[] = [];
    let overlaps = 0;
    for (const [first, second] of pairsOf(allRoutes)) {
      if (first.method !== second.method) continue;
      const witness = unifyTemplates(first.resource, second.resource);
      if (witness === null) continue;
      overlaps++;
      const pairWinner = compareGatewaySpecificity(first.resource, second.resource) <= 0 ? first : second;
      const expected = gatewayOutcome(first.method, witness);
      // A third, more specific resource may win; it must never be the pair's loser.
      const loser = pairWinner === first ? second : first;
      expect(expected.ranRoute, witness).not.toBe(routeKey(loser));
      const actual = await probe(first.method, witness);
      if (actual.ranRoute !== expected.ranRoute || actual.statusCode !== expected.statusCode) {
        mismatches.push(`${first.method} ${witness}: expected ${expected.ranRoute ?? expected.statusCode}, got ${actual.ranRoute ?? actual.statusCode}`);
      }
    }
    expect(overlaps).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });

  it('resolves the resource before the method for every overlapping template pair', async () => {
    // e.g. DELETE /players/me must not reach DELETE /players/{playerId}: the
    // gateway picks /players/me, which has no DELETE, and answers 405.
    const mismatches: string[] = [];
    let crossMethodChecks = 0;
    for (const [first, second] of pairsOf(templates)) {
      const witness = unifyTemplates(first, second);
      if (witness === null) continue;
      const methods = new Set([...methodsOf(first), ...methodsOf(second)]);
      for (const method of methods) {
        crossMethodChecks++;
        const expected = gatewayOutcome(method, witness);
        const actual = await probe(method, witness);
        if (actual.ranRoute !== expected.ranRoute || actual.statusCode !== expected.statusCode) {
          mismatches.push(`${method} ${witness}: expected ${expected.ranRoute ?? expected.statusCode}, got ${actual.ranRoute ?? actual.statusCode}`);
        }
      }
    }
    expect(crossMethodChecks).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });

  it('answers 405 for DELETE /players/me instead of running DELETE /players/{playerId}', async () => {
    expect(await probe('DELETE', '/players/me')).toEqual({ statusCode: 405, ranRoute: null });
  });

  it('answers 404 for a path no route matches', async () => {
    expect(await probe('GET', '/no-such-thing')).toEqual({ statusCode: 404, ranRoute: null });
  });
});
