import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as lookupYoutube, type YoutubeLookupResponse } from '../lookupYoutube';
import { callStaff, seedEpisode, VIDEO_ID } from './episodeTestHelpers';

type Body = YoutubeLookupResponse & { message?: string };

let repos: Repositories;
const fetchMock = vi.fn();

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const lookup = (body: unknown, groups?: string) => callStaff<Body>(lookupYoutube, { body, groups });
const oembedOk = () =>
  new Response(JSON.stringify({ title: 'Night 1', author_name: 'League SZN' }), { status: 200 });

describe('POST /admin/episodes/youtube-lookup', () => {
  it('returns the id, oEmbed title and channel, and the built thumbnail', async () => {
    fetchMock.mockResolvedValue(oembedOk());

    const res = await lookup({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}&t=5s` });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      youtubeVideoId: VIDEO_ID,
      title: 'Night 1',
      channelName: 'League SZN',
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      oembedAvailable: true,
    });
  });

  it('answers 200 with oembedAvailable: false when oEmbed fails', async () => {
    fetchMock.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    const res = await lookup({ url: VIDEO_ID });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      youtubeVideoId: VIDEO_ID,
      title: '',
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      oembedAvailable: false,
    });
  });

  it('answers 200 when fetch throws', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const res = await lookup({ url: VIDEO_ID });

    expect(res.statusCode).toBe(200);
    expect(res.body.oembedAvailable).toBe(false);
  });

  it('hints at an existing episode for the same video', async () => {
    fetchMock.mockResolvedValue(oembedOk());
    const existing = await seedEpisode(repos);

    const res = await lookup({ url: `https://youtu.be/${VIDEO_ID}` });

    expect(res.body.existingEpisodeId).toBe(existing.episodeId);
  });

  it.each([['https://vimeo.com/1'], [''], [undefined], [12]])('rejects url %j with 400', async (url) => {
    const res = await lookup({ url });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Not a YouTube video link');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a Wrestler', async () => {
    expect((await lookup({ url: VIDEO_ID }, 'Wrestler')).statusCode).toBe(403);
  });
});
