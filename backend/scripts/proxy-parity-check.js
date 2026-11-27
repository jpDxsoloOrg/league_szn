#!/usr/bin/env node
'use strict';

/**
 * INFRA-207 PR 1 verification: compares the new `/{proxy+}` route (api Lambda)
 * with the explicit gateway routes for every pre-migration gateway event.
 *
 * Proxy side: `aws apigateway test-invoke-method` on the `/{proxy+}` resource.
 * It really invokes the Lambda and skips gateway authorizers, so it is only
 * ever called on the proxy resource, where the api Lambda authenticates in code.
 * Explicit side: a real HTTPS request to the stage URL.
 *
 * Safety (hard-coded, not flags):
 * - Any call that carries a token must be a GET. assertSafeCall throws otherwise,
 *   and both transports call it before doing anything.
 * - GETs on HEAVY_GET_DENYLIST are skipped.
 * - Non-GET routes are only called without a token and must answer 401/403 on
 *   both sides (POST /auth/setup without x-setup-key must answer 401).
 * - Template params are filled with zz-<name>-zz, so id lookups 404.
 *
 * Usage:
 *   PARITY_ADMIN_TOKEN=<Cognito access token> node scripts/proxy-parity-check.js --stage devtest
 *     [--routes functions/api/__tests__/legacyGatewayRoutes.json] [--rest-api-id id]
 *     [--region us-east-1] [--profile p] [--delay-ms 250] [--only /players]
 * Without PARITY_ADMIN_TOKEN, only the tokenless checks run.
 */

const fs = require('fs');
const path = require('path');
const { createAwsCli, describeStackResourceId, getApiResources, parseArgs } = require('./aws-cli');

const DEFAULT_SERVICE = 'wwe-2k-league-api';
const DEFAULT_ROUTES = path.join(__dirname, '../functions/api/__tests__/legacyGatewayRoutes.json');

/** GETs too heavy or too sensitive to run twice against a live stage. */
const HEAVY_GET_DENYLIST = new Set(['/admin/export-data']);
/** Deleted on purpose in INFRA-207 (0 invocations in 90 days). */
const SKIPPED_PATHS = new Set(['/auth/login']);
/** The one unauthenticated non-GET; without x-setup-key createAdminUser answers 401. */
const SETUP_PATH = '/auth/setup';
const ANY_EXPANSION = ['PUT', 'POST', 'DELETE'];

class UnsafeCallError extends Error {}

/** Throws unless the call is a GET or carries no token. Not configurable. */
function assertSafeCall(method, token) {
  if (token && String(method).toUpperCase() !== 'GET') {
    throw new UnsafeCallError(`Refusing an authenticated ${method}: only GET may carry a token.`);
  }
}

/** `/players/{playerId}` -> `/players/zz-playerId-zz`. */
function fillPath(template) {
  return template.replace(/\{([^}+]+)\+?\}/g, (_match, name) => `zz-${name}-zz`);
}

/**
 * The checks to run for a list of { method, path } gateway events.
 * Each check: { kind: 'get' | 'tokenless' | 'options', method, template, path, expect? }.
 */
function buildChecks(routes, { withToken }) {
  const checks = [];
  const seen = new Set();
  const add = (check) => {
    const key = `${check.kind} ${check.method} ${check.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      checks.push(check);
    }
  };

  for (const route of routes) {
    const template = route.path.startsWith('/') ? route.path : `/${route.path}`;
    if (SKIPPED_PATHS.has(template)) continue;
    const method = String(route.method).toUpperCase();
    const concrete = fillPath(template);
    const methods = method === 'ANY' ? ['GET', ...ANY_EXPANSION] : [method];

    for (const each of methods) {
      if (each === 'OPTIONS') continue;
      if (each === 'GET') {
        if (withToken && !HEAVY_GET_DENYLIST.has(template)) {
          add({ kind: 'get', method: 'GET', template, path: concrete });
        }
      } else if (template === SETUP_PATH) {
        add({ kind: 'tokenless', method: each, template, path: concrete, expect: [401] });
      } else {
        add({
          kind: 'tokenless',
          method: each,
          template,
          path: concrete,
          // An ANY event may not serve this method at all: then both sides answer 405.
          expect: method === 'ANY' ? [401, 403, 405] : [401, 403],
        });
      }
    }
  }
  add({ kind: 'options', method: 'OPTIONS', template: '/{proxy+}', path: '/players' });
  return checks;
}

/** Structural shape of a JSON body: keys and value types, arrays by their first item. */
function bodyShape(body) {
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return typeof body === 'string' && body.length > 0 ? 'text' : 'empty';
  }
  const shape = (node) => {
    if (Array.isArray(node)) return node.length > 0 ? [shape(node[0])] : [];
    if (node && typeof node === 'object') {
      return Object.fromEntries(Object.keys(node).sort().map((key) => [key, shape(node[key])]));
    }
    return node === null ? 'null' : typeof node;
  };
  return JSON.stringify(shape(value));
}

/** Compares the two responses for one check. Returns null when they agree, or a reason. */
function compare(check, proxy, explicit) {
  if (check.kind === 'get') {
    if (proxy.status !== explicit.status) return `status proxy ${proxy.status} vs explicit ${explicit.status}`;
    const proxyShape = bodyShape(proxy.body);
    const explicitShape = bodyShape(explicit.body);
    return proxyShape === explicitShape ? null : 'body shape differs';
  }
  if (check.kind === 'options') {
    return proxy.status === 200 && explicit.status === 200
      ? null
      : `OPTIONS proxy ${proxy.status} vs explicit ${explicit.status}`;
  }
  const allowed = check.expect;
  if (!allowed.includes(proxy.status) || !allowed.includes(explicit.status)) {
    return `expected ${allowed.join('/')} on both sides, got proxy ${proxy.status} vs explicit ${explicit.status}`;
  }
  return proxy.status === explicit.status ? null : `status proxy ${proxy.status} vs explicit ${explicit.status}`;
}

/**
 * Runs every check. `proxyInvoke` and `explicitFetch` both take
 * ({ method, path, token }) and resolve to { status, body }. Each calls
 * assertSafeCall itself; runParity calls it too, before either.
 */
async function runParity({ checks, token, proxyInvoke, explicitFetch, delayMs = 0, log = console.log }) {
  const failures = [];
  for (const check of checks) {
    const callToken = check.kind === 'get' ? token : undefined;
    assertSafeCall(check.method, callToken);
    const request = { method: check.method, path: check.path, token: callToken };
    const proxy = await proxyInvoke(request);
    const explicit = await explicitFetch(request);
    const reason = compare(check, proxy, explicit);
    const label = `${check.method.padEnd(7)} ${check.template}`;
    if (reason) {
      failures.push({ check, reason });
      log(`FAIL ${label}: ${reason}`);
    } else {
      log(`ok   ${label} (${proxy.status})`);
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { failures, total: checks.length };
}

/** Proxy side: test-invoke-method on the `/{proxy+}` resource only. Never logs the request headers. */
function createProxyInvoker(run, restApiId, proxyResourceId) {
  return async ({ method, path: requestPath, token }) => {
    assertSafeCall(method, token);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const result = run([
      'apigateway', 'test-invoke-method',
      '--rest-api-id', restApiId,
      '--resource-id', proxyResourceId,
      '--http-method', method,
      '--path-with-query-string', requestPath,
      '--headers', JSON.stringify(headers),
    ]);
    return { status: result.status, body: result.body || '' };
  };
}

/** Explicit side: a real request on the stage URL. */
function createStageFetcher(stageUrl, fetchImpl = fetch) {
  return async ({ method, path: requestPath, token }) => {
    assertSafeCall(method, token);
    const headers = { Origin: 'https://parity-check.invalid' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === 'OPTIONS') headers['Access-Control-Request-Method'] = 'GET';
    const response = await fetchImpl(`${stageUrl}${requestPath}`, { method, headers, redirect: 'manual' });
    return { status: response.status, body: await response.text() };
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (typeof options.stage !== 'string') {
    console.error('Usage: node scripts/proxy-parity-check.js --stage <stage> [--routes file] [--only prefix]');
    process.exit(2);
  }
  const region = typeof options.region === 'string' ? options.region : process.env.AWS_REGION || 'us-east-1';
  const run = createAwsCli({ region, profile: typeof options.profile === 'string' ? options.profile : undefined });
  const stackName = `${typeof options.service === 'string' ? options.service : DEFAULT_SERVICE}-${options.stage}`;

  const restApiId =
    typeof options['rest-api-id'] === 'string'
      ? options['rest-api-id']
      : describeStackResourceId(run, stackName, 'ApiGatewayRestApi');
  if (!restApiId) throw new Error(`No RestApi found for ${stackName}.`);
  const proxyResource = getApiResources(run, restApiId).find((item) => item.path === '/{proxy+}');
  if (!proxyResource) throw new Error(`RestApi ${restApiId} has no /{proxy+} resource: deploy PR 1 first.`);

  const routesFile = typeof options.routes === 'string' ? path.resolve(options.routes) : DEFAULT_ROUTES;
  let routes = JSON.parse(fs.readFileSync(routesFile, 'utf8'));
  if (typeof options.only === 'string') routes = routes.filter((route) => route.path.startsWith(options.only));

  const token = process.env.PARITY_ADMIN_TOKEN || undefined;
  if (!token) console.log('PARITY_ADMIN_TOKEN is not set: running tokenless checks only.');
  const checks = buildChecks(routes, { withToken: Boolean(token) });
  const stageUrl = `https://${restApiId}.execute-api.${region}.amazonaws.com/${options.stage}`;

  const { failures, total } = await runParity({
    checks,
    token,
    proxyInvoke: createProxyInvoker(run, restApiId, proxyResource.id),
    explicitFetch: createStageFetcher(stageUrl),
    delayMs: typeof options['delay-ms'] === 'string' ? Number(options['delay-ms']) : 250,
  });
  console.log(`${total - failures.length}/${total} checks agree.`);
  if (failures.length > 0) process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  HEAVY_GET_DENYLIST,
  UnsafeCallError,
  assertSafeCall,
  fillPath,
  buildChecks,
  bodyShape,
  compare,
  runParity,
  createProxyInvoker,
  createStageFetcher,
};
