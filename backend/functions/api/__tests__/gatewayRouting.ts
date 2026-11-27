/**
 * Test helpers that model how API Gateway (REST, v1) picks a resource, so the
 * merged route table can be checked against it (INFRA-207, plan 5.1 / 5.10).
 *
 * API Gateway resolves the resource first: of the templates matching a path,
 * the one whose leftmost differing segment is a literal wins. Only then does
 * it look at the method; a missing method fails and never falls back to a less
 * specific resource. Route templates here have single-segment params only (no
 * greedy `+`), so templates that match the same path have the same length.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from 'aws-lambda';
import { vi } from 'vitest';
import { createRouter, type RouteConfig } from '../../../lib/router';

export const routeKey = (route: Pick<RouteConfig, 'method' | 'resource'>): string =>
  `${route.method} ${route.resource}`;

export const segmentsOf = (template: string): string[] => template.split('/').filter(Boolean);

export const isParamSegment = (segment: string): boolean => /^\{[^}]+\}$/.test(segment);

/** The literal/param shape of a template, e.g. `/players/{id}` -> `L:players/P`. */
export const shapeOf = (template: string): string =>
  segmentsOf(template).map((segment) => (isParamSegment(segment) ? 'P' : `L:${segment}`)).join('/');

/** Fills every `{x}` with `zz-x-zz`, a value no literal segment uses. */
export const concretePath = (template: string): string =>
  template.replace(/\{([^}]+)\}/g, (_, name: string) => `zz-${name}-zz`);

/**
 * A concrete path both templates match, or null when they cannot both match
 * one path. Uses the literal where either side has one, `zz` otherwise.
 */
export function unifyTemplates(first: string, second: string): string | null {
  const firstSegments = segmentsOf(first);
  const secondSegments = segmentsOf(second);
  if (firstSegments.length !== secondSegments.length) return null;
  const witness: string[] = [];
  for (let i = 0; i < firstSegments.length; i++) {
    const firstIsParam = isParamSegment(firstSegments[i]);
    const secondIsParam = isParamSegment(secondSegments[i]);
    if (!firstIsParam && !secondIsParam && firstSegments[i] !== secondSegments[i]) return null;
    if (!firstIsParam) witness.push(firstSegments[i]);
    else if (!secondIsParam) witness.push(secondSegments[i]);
    else witness.push('zz');
  }
  return `/${witness.join('/')}`;
}

export function templateMatches(template: string, path: string): boolean {
  const templateSegments = segmentsOf(template);
  const pathSegments = segmentsOf(path);
  return templateSegments.length === pathSegments.length
    && templateSegments.every((segment, i) => isParamSegment(segment) || segment === pathSegments[i]);
}

/** Negative when `first` is more specific: its leftmost differing segment is the literal. */
export function compareGatewaySpecificity(first: string, second: string): number {
  const firstSegments = segmentsOf(first);
  const secondSegments = segmentsOf(second);
  for (let i = 0; i < Math.min(firstSegments.length, secondSegments.length); i++) {
    const firstIsParam = isParamSegment(firstSegments[i]);
    const secondIsParam = isParamSegment(secondSegments[i]);
    if (firstIsParam !== secondIsParam) return firstIsParam ? 1 : -1;
  }
  return 0;
}

/** The resource template API Gateway would pick for `path`, regardless of method. */
export function gatewayResource(templates: ReadonlyArray<string>, path: string): string | null {
  const matching = templates.filter((template) => templateMatches(template, path));
  if (matching.length === 0) return null;
  return [...matching].sort(compareGatewaySpecificity)[0];
}

export type RouterCall = { statusCode: number; ranRoute: string | null };

/**
 * A router over `routes` with every handler replaced by a stub that reports
 * which route ran. The caller is authenticated by the test's mocked
 * authenticate(), so access rules never hide the route choice.
 */
export function createProbeRouter(routes: ReadonlyArray<RouteConfig>) {
  const stubbed = routes.map((route) => ({
    ...route,
    handler: async (): Promise<APIGatewayProxyResult> => ({ statusCode: 200, body: routeKey(route) }),
  })) as RouteConfig[];
  const router = createRouter(stubbed);
  const context = {} as Context;
  const callback = vi.fn() as Callback<APIGatewayProxyResult>;

  return async (method: string, path: string): Promise<RouterCall> => {
    const event = {
      httpMethod: method,
      resource: '/{proxy+}',
      path,
      pathParameters: { proxy: path.slice(1) },
      queryStringParameters: null,
      headers: {},
      requestContext: {},
    } as unknown as APIGatewayProxyEvent;
    const result = (await router(event, context, callback)) as APIGatewayProxyResult;
    const ranRoute = result.statusCode === 200 ? result.body : null;
    return { statusCode: result.statusCode, ranRoute };
  };
}
