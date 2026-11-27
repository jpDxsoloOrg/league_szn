import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

vi.mock('../../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('../../__tests__/visibilityTestHelpers');
  return { authenticate: fakeAuthenticate };
});

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import { handler as liveStreamRouter } from '../handler';
import type { PublicLiveStream } from '../../../lib/liveStream';
import type { LiveStreamUpdateResponse } from '../updateLiveStream';

type Auth = Pick<APIGatewayProxyEvent, 'headers'>;
type PutBody = LiveStreamUpdateResponse & { message?: string };

const MODERATOR = bearer('mod-sub', 'Moderator');
const ADMIN = bearer('admin-sub', 'Admin');
const WRESTLER = bearer('wrestler-sub', 'Wrestler');

const T0 = new Date('2026-11-27T20:42:00.000Z');
const HOUR = 60 * 60 * 1000;

let repos: Repositories;

const getStream = (auth: Auth | Record<string, never> = {}) =>
  call<PublicLiveStream>(liveStreamRouter, makeEvent({
    ...auth,
    httpMethod: 'GET',
    resource: '/live-stream',
    path: '/live-stream',
  }));

const putStream = (body: unknown, auth: Auth | Record<string, never> = MODERATOR) =>
  call<PutBody>(liveStreamRouter, makeEvent({
    ...auth,
    httpMethod: 'PUT',
    resource: '/admin/live-stream',
    path: '/admin/live-stream',
    body: JSON.stringify(body),
  }));

const at = (ms: number) => vi.setSystemTime(new Date(T0.getTime() + ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.useRealTimers();
});

describe('GET /live-stream', () => {
  it('is public and offline with no channel by default', async () => {
    const res = await getStream();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ channel: '', isLive: false });
  });

  it('leaves out updatedBy', async () => {
    await putStream({ channel: 'LeagueSZN', isLive: true, title: 'Season 5 Night 1' });

    const res = await getStream();

    expect(res.body).toEqual({
      channel: 'leagueszn',
      isLive: true,
      title: 'Season 5 Night 1',
      liveSince: T0.toISOString(),
    });
    expect(JSON.stringify(res.body)).not.toContain('mod-sub');
  });
});

describe('8-hour guard', () => {
  beforeEach(async () => {
    await putStream({ channel: 'leagueszn', isLive: true });
  });

  it('stays live at exactly 8 hours', async () => {
    at(8 * HOUR);

    expect((await getStream()).body.isLive).toBe(true);
  });

  it('reads offline once liveSince is more than 8 hours old, without writing', async () => {
    at(8 * HOUR + 1000);

    const res = await getStream();

    expect(res.body).toEqual({ channel: 'leagueszn', isLive: false });
    const stored = await repos.user.siteConfig.getLiveStream();
    expect(stored.isLive).toBe(true);
    expect(stored.liveSince).toBe(T0.toISOString());
  });

  it('keeps liveSince when saving again inside the window', async () => {
    at(2 * HOUR);

    const res = await putStream({ isLive: true, title: 'Night 1, part 2' });

    expect(res.body.liveSince).toBe(T0.toISOString());
    expect(res.body.title).toBe('Night 1, part 2');
  });

  it('keeps liveSince when an edit leaves isLive out', async () => {
    at(HOUR);

    const res = await putStream({ title: 'Renamed' });

    expect(res.body.isLive).toBe(true);
    expect(res.body.liveSince).toBe(T0.toISOString());
  });

  it('stamps a new liveSince when Go live is pressed after the auto-off', async () => {
    at(9 * HOUR);
    expect((await getStream()).body.isLive).toBe(false);

    const res = await putStream({ isLive: true });

    const nowIso = new Date(T0.getTime() + 9 * HOUR).toISOString();
    expect(res.statusCode).toBe(200);
    expect(res.body.isLive).toBe(true);
    expect(res.body.liveSince).toBe(nowIso);
    expect((await getStream()).body).toMatchObject({ isLive: true, liveSince: nowIso });
  });

  it('stamps liveSince when the stored row is live but has none', async () => {
    await repos.user.siteConfig.setLiveStream({ channel: 'leagueszn', isLive: true });

    const res = await putStream({ isLive: true });

    expect(res.body.liveSince).toBe(T0.toISOString());
  });

  it('does not bring a stale stream back on an edit without isLive', async () => {
    at(9 * HOUR);

    const res = await putStream({ title: 'Later' });

    expect(res.body.isLive).toBe(false);
    expect(res.body).not.toHaveProperty('liveSince');
  });
});

describe('PUT /admin/live-stream', () => {
  it('turning live off clears liveSince', async () => {
    await putStream({ channel: 'leagueszn', isLive: true });

    const res = await putStream({ isLive: false });

    expect(res.body).toMatchObject({ channel: 'leagueszn', isLive: false, updatedBy: 'mod-sub' });
    expect(res.body).not.toHaveProperty('liveSince');
    expect(await repos.user.siteConfig.getLiveStream()).not.toHaveProperty('liveSince');
  });

  it('stores the channel lowercase and records who changed it', async () => {
    const res = await putStream({ channel: '  Big_Show_Live ' }, ADMIN);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ channel: 'big_show_live', isLive: false, updatedBy: 'admin-sub' });
    expect(res.body.updatedAt).toBe(T0.toISOString());
  });

  it.each(['abc', 'a'.repeat(26), 'has space', 'dash-name', 'émile1'])('rejects channel %j', async (channel) => {
    expect((await putStream({ channel })).statusCode).toBe(400);
  });

  it('rejects a title over 120 characters and clears it with null', async () => {
    expect((await putStream({ channel: 'leagueszn', title: 't'.repeat(121) })).statusCode).toBe(400);
    expect((await putStream({ channel: 'leagueszn', title: 't'.repeat(120) })).statusCode).toBe(200);

    const res = await putStream({ title: null });

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toHaveProperty('title');
  });

  it('refuses to go live with no channel', async () => {
    const res = await putStream({ isLive: true });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Set a channel before going live');
  });

  it("refuses to clear the channel while live", async () => {
    await putStream({ channel: 'leagueszn', isLive: true });

    expect((await putStream({ channel: '' })).statusCode).toBe(400);
  });

  it.each([[{}], [{ isLive: 'true' }], [{ channel: 42 }], [{ title: 5 }]])('rejects body %j', async (body) => {
    expect((await putStream(body)).statusCode).toBe(400);
  });

  it('refuses a Wrestler and a caller without a valid token', async () => {
    expect((await putStream({ channel: 'leagueszn' }, WRESTLER)).statusCode).toBe(403);
    expect((await putStream({ channel: 'leagueszn' }, { headers: { Authorization: 'Bearer invalid' } })).statusCode)
      .toBe(401);
    expect((await repos.user.siteConfig.getLiveStream()).channel).toBe('');
  });
});
