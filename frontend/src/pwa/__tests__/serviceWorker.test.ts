import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Runs public/sw.js as-is inside a fake ServiceWorkerGlobalScope, so the shipped
 * file is what gets tested, not a copy of its logic.
 */

const ORIGIN = 'https://leagueszn.example';
const swSource = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

type RequestLike = Pick<Request, 'url' | 'method' | 'mode' | 'cache' | 'headers'>;
type Listener = (event: unknown) => void;

const keyOf = (request: RequestLike | string): string =>
  typeof request === 'string' ? new URL(request, ORIGIN).href : request.url;

class FakeCache {
  readonly entries = new Map<string, Response>();

  constructor(private readonly fetchImpl: (request: RequestLike) => Promise<Response>) {}

  async match(request: RequestLike | string): Promise<Response | undefined> {
    return this.entries.get(keyOf(request))?.clone();
  }

  async put(request: RequestLike | string, response: Response): Promise<void> {
    this.entries.set(keyOf(request), response);
  }

  async delete(request: RequestLike | string): Promise<boolean> {
    return this.entries.delete(keyOf(request));
  }

  async keys(): Promise<string[]> {
    return [...this.entries.keys()];
  }

  async addAll(requests: RequestLike[]): Promise<void> {
    for (const request of requests) {
      const response = await this.fetchImpl(request);
      if (!response.ok) throw new TypeError(`addAll failed for ${request.url}`);
      await this.put(request, response);
    }
  }
}

class FakeCacheStorage {
  readonly stores = new Map<string, FakeCache>();

  constructor(private readonly fetchImpl: (request: RequestLike) => Promise<Response>) {}

  async open(name: string): Promise<FakeCache> {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new FakeCache(this.fetchImpl);
      this.stores.set(name, cache);
    }
    return cache;
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }
}

/** Real Responses report type "default"; same-origin fetches report "basic". */
function basicResponse(body: string, contentType: string, status = 200): Response {
  const response = new Response(body, { status, headers: { 'content-type': contentType } });
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}

function makeRequest(path: string, options: Partial<{ method: string; mode: RequestMode; headers: Record<string, string> }> = {}): RequestLike {
  return {
    url: new URL(path, ORIGIN).href,
    method: options.method ?? 'GET',
    mode: options.mode ?? 'cors',
    cache: 'default',
    headers: new Headers(options.headers ?? {}),
  };
}

/** Lets sw.js build relative Requests the way a browser resolves them against its origin. */
class ScopedRequest {
  readonly url: string;
  readonly method = 'GET';
  readonly mode: RequestMode = 'cors';
  readonly cache: RequestCache;
  readonly headers = new Headers();

  constructor(input: string, init: RequestInit = {}) {
    this.url = new URL(input, ORIGIN).href;
    this.cache = init.cache ?? 'default';
  }
}

interface FetchEventHarness {
  respondWith: ReturnType<typeof vi.fn>;
  waitUntil: ReturnType<typeof vi.fn>;
  response: () => Promise<Response>;
  settled: () => Promise<void>;
}

function loadServiceWorker() {
  const listeners = new Map<string, Listener[]>();
  const fetchMock = vi.fn<(request: RequestLike) => Promise<Response>>();
  const cacheStorage = new FakeCacheStorage((request) => fetchMock(request));
  const scope = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };

  runInNewContext(swSource, {
    self: scope,
    caches: cacheStorage,
    fetch: (request: RequestLike) => fetchMock(request),
    Request: ScopedRequest,
    Response,
    URL,
    Headers,
    console,
  });

  const dispatch = (type: string, event: unknown) => {
    (listeners.get(type) ?? []).forEach((listener) => listener(event));
  };

  const lifecycle = async (type: 'install' | 'activate') => {
    const waits: Promise<unknown>[] = [];
    dispatch(type, { waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    await Promise.all(waits);
  };

  const fetchEvent = (request: RequestLike): FetchEventHarness => {
    let responsePromise: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    const respondWith = vi.fn((promise: Promise<Response>) => {
      responsePromise = promise;
    });
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      waits.push(promise);
    });
    dispatch('fetch', { request, respondWith, waitUntil });
    return {
      respondWith,
      waitUntil,
      response: async () => {
        if (!responsePromise) throw new Error('respondWith was not called');
        return responsePromise;
      },
      settled: async () => {
        await responsePromise;
        await Promise.all(waits);
      },
    };
  };

  const cacheNamed = (fragment: string): FakeCache | undefined =>
    [...cacheStorage.stores.entries()].find(([name]) => name.includes(fragment))?.[1];

  return { scope, fetchMock, cacheStorage, lifecycle, fetchEvent, cacheNamed };
}

type Harness = ReturnType<typeof loadServiceWorker>;

/** Serves every precached file so install succeeds. */
function serveStaticFiles(harness: Harness): void {
  harness.fetchMock.mockImplementation(async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === '/offline.html') return basicResponse('<h1>You are offline</h1>', 'text/html');
    if (pathname.endsWith('.webmanifest')) return basicResponse('{}', 'application/manifest+json');
    return basicResponse('png', 'image/png');
  });
}

describe('service worker (public/sw.js)', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = loadServiceWorker();
  });

  describe('lifecycle', () => {
    it('precaches the offline page, manifest and brand icons on install, then skips waiting', async () => {
      serveStaticFiles(harness);
      await harness.lifecycle('install');

      const precache = harness.cacheNamed('precache');
      const cachedPaths = [...(precache?.entries.keys() ?? [])].map((url) => new URL(url).pathname);
      expect(cachedPaths).toContain('/offline.html');
      expect(cachedPaths).toContain('/manifest.webmanifest');
      expect(cachedPaths).toContain('/images/brand/icon-192.png');
      expect(cachedPaths).toContain('/images/brand/icon-maskable-512.png');
      expect(cachedPaths).not.toContain('/index.html');
      expect(cachedPaths).not.toContain('/');
      expect(harness.scope.skipWaiting).toHaveBeenCalled();
    });

    it('deletes caches from older versions on activate and claims open pages', async () => {
      serveStaticFiles(harness);
      await harness.lifecycle('install');
      await harness.cacheStorage.open('league-szn-precache-v0');
      await harness.cacheStorage.open('some-old-cache');

      await harness.lifecycle('activate');

      const names = await harness.cacheStorage.keys();
      expect(names).not.toContain('league-szn-precache-v0');
      expect(names).not.toContain('some-old-cache');
      expect(names.some((name) => name.includes('precache'))).toBe(true);
      expect(harness.scope.clients.claim).toHaveBeenCalled();
    });
  });

  describe('navigations', () => {
    it('go to the network first and return the live page', async () => {
      serveStaticFiles(harness);
      await harness.lifecycle('install');
      harness.fetchMock.mockClear();
      harness.fetchMock.mockResolvedValueOnce(basicResponse('<div id="root"></div>', 'text/html'));

      const event = harness.fetchEvent(makeRequest('/standings', { mode: 'navigate' }));
      const response = await event.response();

      expect(harness.fetchMock).toHaveBeenCalledTimes(1);
      expect(await response.text()).toBe('<div id="root"></div>');
    });

    it('fall back to the cached offline page when the network fails', async () => {
      serveStaticFiles(harness);
      await harness.lifecycle('install');
      harness.fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const event = harness.fetchEvent(makeRequest('/events', { mode: 'navigate' }));
      const response = await event.response();

      expect(await response.text()).toContain('offline');
    });

    it('never store the page they load, so a stale shell cannot be served', async () => {
      serveStaticFiles(harness);
      await harness.lifecycle('install');
      harness.fetchMock.mockResolvedValueOnce(basicResponse('<div id="root"></div>', 'text/html'));

      const event = harness.fetchEvent(makeRequest('/', { mode: 'navigate' }));
      await event.settled();

      const allCachedUrls = [...harness.cacheStorage.stores.values()].flatMap((cache) => [...cache.entries.keys()]);
      expect(allCachedUrls).not.toContain(`${ORIGIN}/`);
    });
  });

  describe('hashed assets', () => {
    it('are fetched once, then served from the cache', async () => {
      harness.fetchMock.mockImplementation(async () => basicResponse('console.log(1)', 'application/javascript'));
      const request = makeRequest('/assets/index-abc123.js');

      const first = harness.fetchEvent(request);
      await first.settled();
      const second = harness.fetchEvent(request);
      await second.settled();

      expect(harness.fetchMock).toHaveBeenCalledTimes(1);
      expect(await (await second.response()).text()).toBe('console.log(1)');
    });

    it('are not cached when CloudFront answers a missing file with index.html', async () => {
      harness.fetchMock.mockImplementation(async () => basicResponse('<!doctype html>', 'text/html'));
      const request = makeRequest('/assets/missing-abc123.js');

      await harness.fetchEvent(request).settled();
      await harness.fetchEvent(request).settled();

      expect(harness.fetchMock).toHaveBeenCalledTimes(2);
      expect(harness.cacheNamed('assets')?.entries.size ?? 0).toBe(0);
    });

    it('are not cached when the response is an error', async () => {
      harness.fetchMock.mockImplementation(async () => basicResponse('nope', 'text/plain', 500));

      await harness.fetchEvent(makeRequest('/assets/broken-abc123.css')).settled();

      expect(harness.cacheNamed('assets')?.entries.size ?? 0).toBe(0);
    });

    it('keep the cache to at most 150 files, dropping the oldest', async () => {
      harness.fetchMock.mockImplementation(async () => basicResponse('x', 'application/javascript'));

      for (let index = 0; index < 155; index += 1) {
        await harness.fetchEvent(makeRequest(`/assets/chunk-${index}.js`)).settled();
      }

      const cachedUrls = [...(harness.cacheNamed('assets')?.entries.keys() ?? [])];
      expect(cachedUrls).toHaveLength(150);
      expect(cachedUrls).not.toContain(`${ORIGIN}/assets/chunk-0.js`);
      expect(cachedUrls).toContain(`${ORIGIN}/assets/chunk-154.js`);
    });
  });

  describe('requests left to the browser', () => {
    it.each([
      ['the API', 'https://abc123.execute-api.us-east-1.amazonaws.com/dev/standings'],
      ['Cognito', 'https://cognito-idp.us-east-1.amazonaws.com/'],
      ['S3 images', 'https://wwe-2k-league-api-images-dev.s3.amazonaws.com/wrestlers/a.png'],
      ['wiki markdown', `${ORIGIN}/wiki/faqs.md`],
      ['the wiki index', `${ORIGIN}/wiki/index.json`],
      ['another origin\'s /assets/ files', 'https://cdn.example.com/assets/index-abc123.js'],
    ])('does not intercept %s', (_label, url) => {
      const event = harness.fetchEvent({ ...makeRequest('/'), url });

      expect(event.respondWith).not.toHaveBeenCalled();
      expect(harness.fetchMock).not.toHaveBeenCalled();
    });

    it('does not intercept requests that are not GET', () => {
      const event = harness.fetchEvent(makeRequest('/assets/index-abc123.js', { method: 'POST' }));

      expect(event.respondWith).not.toHaveBeenCalled();
    });

    it('does not intercept a navigation that is not GET', () => {
      const event = harness.fetchEvent(makeRequest('/login', { method: 'POST', mode: 'navigate' }));

      expect(event.respondWith).not.toHaveBeenCalled();
    });

    it('does not intercept range requests', () => {
      const event = harness.fetchEvent(makeRequest('/assets/intro-abc123.mp4', { headers: { range: 'bytes=0-' } }));

      expect(event.respondWith).not.toHaveBeenCalled();
    });
  });

  describe('precached static files', () => {
    it('come from the network when online and from the precache when offline', async () => {
      serveStaticFiles(harness);
      await harness.lifecycle('install');
      harness.fetchMock.mockClear();

      const online = harness.fetchEvent(makeRequest('/images/brand/icon-192.png'));
      await online.settled();
      expect(harness.fetchMock).toHaveBeenCalledTimes(1);

      harness.fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const offline = harness.fetchEvent(makeRequest('/images/brand/icon-192.png'));
      expect(await (await offline.response()).text()).toBe('png');
    });
  });
});
