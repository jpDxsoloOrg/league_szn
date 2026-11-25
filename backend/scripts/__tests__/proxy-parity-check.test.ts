import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

interface Check {
  kind: 'get' | 'tokenless' | 'options';
  method: string;
  template: string;
  path: string;
  expect?: number[];
}

interface Request {
  method: string;
  path: string;
  token?: string;
}

interface Reply {
  status: number;
  body: string;
}

interface ParityCheck {
  assertSafeCall: (method: string, token?: string) => void;
  fillPath: (template: string) => string;
  buildChecks: (routes: { method: string; path: string }[], options: { withToken: boolean }) => Check[];
  bodyShape: (body: string) => string;
  runParity: (options: {
    checks: Check[];
    token?: string;
    proxyInvoke: (request: Request) => Promise<Reply>;
    explicitFetch: (request: Request) => Promise<Reply>;
    log?: (line: string) => void;
  }) => Promise<{ failures: { reason: string }[]; total: number }>;
  createProxyInvoker: (run: (args: string[]) => unknown, restApiId: string, proxyId: string) => (r: Request) => Promise<Reply>;
  createStageFetcher: (stageUrl: string, fetchImpl: typeof fetch) => (r: Request) => Promise<Reply>;
}

const load = createRequire(__filename);
const parity = load('../proxy-parity-check.js') as ParityCheck;

describe('proxy-parity-check safety', () => {
  it('refuses any authenticated non-GET', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'post']) {
      expect(() => parity.assertSafeCall(method, 'token')).toThrow(/Refusing an authenticated/);
    }
    expect(() => parity.assertSafeCall('GET', 'token')).not.toThrow();
    expect(() => parity.assertSafeCall('DELETE', undefined)).not.toThrow();
  });

  it('refuses in both transports before any call is made', async () => {
    const run = vi.fn();
    const fetchImpl = vi.fn();
    const request = { method: 'DELETE', path: '/admin/clear-all', token: 'token' };
    await expect(parity.createProxyInvoker(run, 'api', 'proxy')(request)).rejects.toThrow(/Refusing/);
    await expect(parity.createStageFetcher('https://x', fetchImpl as unknown as typeof fetch)(request)).rejects.toThrow(
      /Refusing/,
    );
    expect(run).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends a token only on GET checks and never runs an authenticated write', async () => {
    const checks = parity.buildChecks(
      [
        { method: 'GET', path: '/players/{playerId}' },
        { method: 'DELETE', path: '/admin/clear-all' },
        { method: 'ANY', path: '/admin/announcements' },
      ],
      { withToken: true },
    );
    const seen: Request[] = [];
    const reply = async (request: Request): Promise<Reply> => {
      seen.push(request);
      if (request.method === 'GET') return { status: 404, body: '{"message":"x"}' };
      if (request.method === 'OPTIONS') return { status: 200, body: '' };
      return { status: 401, body: '' };
    };
    const { failures } = await parity.runParity({
      checks,
      token: 'token',
      proxyInvoke: reply,
      explicitFetch: reply,
      log: () => undefined,
    });
    expect(failures).toEqual([]);
    for (const request of seen) {
      if (request.method !== 'GET') expect(request.token).toBeUndefined();
    }
    expect(seen.some((request) => request.method === 'GET' && request.token === 'token')).toBe(true);
  });
});

describe('proxy-parity-check plan', () => {
  it('fills template params with zz values', () => {
    expect(parity.fillPath('/stables/{stableId}/invitations/{invitationId}')).toBe(
      '/stables/zz-stableId-zz/invitations/zz-invitationId-zz',
    );
  });

  it('skips the heavy-GET denylist, /auth/login and GETs without a token', () => {
    const routes = [
      { method: 'GET', path: '/admin/export-data' },
      { method: 'POST', path: '/auth/login' },
      { method: 'GET', path: '/players' },
    ];
    const withToken = parity.buildChecks(routes, { withToken: true }).map((check) => `${check.method} ${check.path}`);
    expect(withToken).toEqual(['GET /players', 'OPTIONS /players']);

    const tokenless = parity.buildChecks(routes, { withToken: false }).map((check) => `${check.method} ${check.path}`);
    expect(tokenless).toEqual(['OPTIONS /players']);
  });

  it('expects 401 from POST /auth/setup and 401/403 from other non-GETs', () => {
    const checks = parity.buildChecks(
      [
        { method: 'post', path: '/auth/setup' },
        { method: 'PUT', path: '/players/{playerId}' },
      ],
      { withToken: false },
    );
    expect(checks.slice(0, 2)).toEqual([
      { kind: 'tokenless', method: 'POST', template: '/auth/setup', path: '/auth/setup', expect: [401] },
      { kind: 'tokenless', method: 'PUT', template: '/players/{playerId}', path: '/players/zz-playerId-zz', expect: [401, 403] },
    ]);
  });

  it('flags a status or body-shape difference', async () => {
    const checks = parity.buildChecks([{ method: 'GET', path: '/players' }], { withToken: true }).slice(0, 1);
    const { failures } = await parity.runParity({
      checks,
      token: 'token',
      proxyInvoke: async () => ({ status: 200, body: '[{"playerId":"a","name":"b"}]' }),
      explicitFetch: async () => ({ status: 200, body: '[{"playerId":"a"}]' }),
      log: () => undefined,
    });
    expect(failures.map((failure) => failure.reason)).toEqual(['body shape differs']);
  });

  it('flags a non-GET that is not refused on both sides', async () => {
    const checks = parity.buildChecks([{ method: 'DELETE', path: '/players/{playerId}' }], { withToken: false }).slice(0, 1);
    const { failures } = await parity.runParity({
      checks,
      proxyInvoke: async () => ({ status: 401, body: '' }),
      explicitFetch: async () => ({ status: 404, body: '' }),
      log: () => undefined,
    });
    expect(failures).toHaveLength(1);
  });

  it('compares body shapes, not values', () => {
    expect(parity.bodyShape('{"b":1,"a":[{"x":"y"}]}')).toBe(parity.bodyShape('{"a":[{"x":"z"}],"b":2}'));
    expect(parity.bodyShape('{"a":1}')).not.toBe(parity.bodyShape('{"a":"1"}'));
  });

  it('invokes the proxy resource with the token only in headers', async () => {
    const run = vi.fn((_args: string[]): unknown => ({ status: 200, body: '{}' }));
    await parity.createProxyInvoker(run, 'api123', 'prox1')({ method: 'GET', path: '/players/zz-playerId-zz', token: 't' });
    const args = run.mock.calls[0][0];
    expect(args.slice(0, 10)).toEqual([
      'apigateway', 'test-invoke-method',
      '--rest-api-id', 'api123',
      '--resource-id', 'prox1',
      '--http-method', 'GET',
      '--path-with-query-string', '/players/zz-playerId-zz',
    ]);
    expect(JSON.parse(args[11])).toEqual({ Authorization: 'Bearer t' });
  });
});
