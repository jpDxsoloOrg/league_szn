import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { Episode } from '../../../lib/repositories/types';
import { handler as createEpisode } from '../createEpisode';
import { handler as listEpisodes } from '../listEpisodes';
import { callStaff, seedEpisode, seedEvent, VIDEO_ID } from './episodeTestHelpers';

type Body = Episode & { message?: string; existingEpisodeId?: string };

let repos: Repositories;
const fetchMock = vi.fn();

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const create = (body: unknown, groups?: string) => callStaff<Body>(createEpisode, { body, groups });

describe('POST /admin/episodes', () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO_ID}&t=30s`,
    `https://youtu.be/${VIDEO_ID}?si=x`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
    `https://www.youtube.com/live/${VIDEO_ID}`,
    `youtube.com/watch?v=${VIDEO_ID}`,
    VIDEO_ID,
  ])('creates an episode from %s', async (url) => {
    const res = await create({ url, title: ' Night 1 ', channelName: 'League SZN' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      source: 'youtube',
      youtubeVideoId: VIDEO_ID,
      title: 'Night 1',
      channelName: 'League SZN',
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      description: '',
      createdBy: 'mod-sub',
    });
  });

  it('defaults to a draft aired today (UTC), and never calls fetch', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-27T23:30:00.000Z'));

    const res = await create({ url: VIDEO_ID, title: 'Night 1' });

    expect(res.body.isPublished).toBe('false');
    expect(res.body.airDate).toBe('2026-11-27');
    expect(res.body).not.toHaveProperty('eventId');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores eventId, isPublished, description and airDate', async () => {
    const eventId = await seedEvent(repos);

    const res = await create({
      url: VIDEO_ID,
      title: 'Night 1',
      description: 'Main event: a ladder match.',
      airDate: '2026-11-02',
      eventId,
      isPublished: true,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      eventId,
      isPublished: 'true',
      description: 'Main event: a ladder match.',
      airDate: '2026-11-02',
    });
  });

  it.each([
    ['another host', 'https://vimeo.com/123'],
    ['a playlist', 'https://www.youtube.com/playlist?list=PL123'],
    ['a missing url', undefined],
    ['a number', 42],
  ])('rejects %s with 400', async (_label, url) => {
    const res = await create({ url, title: 'Night 1' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Not a YouTube video link');
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['not a string', 5],
  ])('rejects a %s title with 400', async (_label, title) => {
    const res = await create({ url: VIDEO_ID, title });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Title required');
  });

  it('rejects a title over 200 characters', async () => {
    expect((await create({ url: VIDEO_ID, title: 'x'.repeat(201) })).statusCode).toBe(400);
    expect((await create({ url: VIDEO_ID, title: 'x'.repeat(200) })).statusCode).toBe(201);
  });

  it('rejects a channel name over 200 characters and a description over 5000', async () => {
    expect((await create({ url: VIDEO_ID, title: 'T', channelName: 'c'.repeat(201) })).statusCode).toBe(400);
    expect((await create({ url: VIDEO_ID, title: 'T', description: 'd'.repeat(5001) })).statusCode).toBe(400);
  });

  it.each(['2026-13-01', '2026-02-30', '2026-11-01T00:00:00Z', 'yesterday', 20261101])(
    'rejects airDate %j',
    async (airDate) => {
      expect((await create({ url: VIDEO_ID, title: 'T', airDate })).statusCode).toBe(400);
    },
  );

  it('rejects a duplicate video with 400 and points at the existing episode', async () => {
    const existing = await seedEpisode(repos);

    const res = await create({ url: `https://youtu.be/${VIDEO_ID}`, title: 'Again' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('This video is already an episode');
    expect(res.body.existingEpisodeId).toBe(existing.episodeId);
  });

  it('rejects an unknown event with 400', async () => {
    const res = await create({ url: VIDEO_ID, title: 'T', eventId: 'no-such-event' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Event not found');
  });

  it("treats eventId '' as no event", async () => {
    const res = await create({ url: VIDEO_ID, title: 'T', eventId: '' });

    expect(res.statusCode).toBe(201);
    expect(res.body).not.toHaveProperty('eventId');
  });

  it.each(['false', 'true', 1, null])('rejects isPublished %j with 400', async (isPublished) => {
    const res = await create({ url: VIDEO_ID, title: 'T', isPublished });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('isPublished must be a boolean');
  });

  it('refuses a Wrestler', async () => {
    expect((await create({ url: VIDEO_ID, title: 'T' }, 'Wrestler')).statusCode).toBe(403);
  });

  it('rejects invalid JSON', async () => {
    const res = await callStaff<Body>(createEpisode, { body: undefined });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /admin/episodes', () => {
  it('lists drafts too, newest air date first, with full rows', async () => {
    await seedEpisode(repos, { youtubeVideoId: 'aaaaaaaaaaa', airDate: '2026-10-01', isPublished: true });
    await seedEpisode(repos, { youtubeVideoId: 'bbbbbbbbbbb', airDate: '2026-12-01' });

    const res = await callStaff<Episode[]>(listEpisodes, { method: 'GET' });

    expect(res.statusCode).toBe(200);
    expect(res.body.map((episode) => episode.youtubeVideoId)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa']);
    expect(res.body[0].createdBy).toBe('gm-sub-secret');
  });

  it('refuses a Wrestler', async () => {
    expect((await callStaff(listEpisodes, { method: 'GET', groups: 'Wrestler' })).statusCode).toBe(403);
  });
});
