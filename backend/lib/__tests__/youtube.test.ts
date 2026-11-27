import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  fetchYoutubeOEmbed,
  parseYoutubeVideoId,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from '../youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYoutubeVideoId', () => {
  it.each([
    ['watch', `https://www.youtube.com/watch?v=${ID}`],
    ['watch with a timestamp', `https://www.youtube.com/watch?v=${ID}&t=30s`],
    ['watch with v after other params', `https://www.youtube.com/watch?feature=share&v=${ID}`],
    ['mobile host', `https://m.youtube.com/watch?v=${ID}`],
    ['music host', `https://music.youtube.com/watch?v=${ID}`],
    ['bare host', `https://youtube.com/watch?v=${ID}`],
    ['http scheme', `http://www.youtube.com/watch?v=${ID}`],
    ['upper-case host', `https://WWW.YouTube.com/watch?v=${ID}`],
    ['short link with si', `https://youtu.be/${ID}?si=abcdef`],
    ['shorts', `https://www.youtube.com/shorts/${ID}`],
    ['embed', `https://www.youtube.com/embed/${ID}`],
    ['nocookie embed', `https://www.youtube-nocookie.com/embed/${ID}?rel=0`],
    ['live', `https://www.youtube.com/live/${ID}?feature=shared`],
    ['legacy /v/', `https://www.youtube.com/v/${ID}`],
    ['watch with a playlist', `https://www.youtube.com/watch?v=${ID}&list=PL123`],
    ['bare id', ID],
    ['bare id with whitespace', `  ${ID}\n`],
    ['no scheme', `youtube.com/watch?v=${ID}`],
    ['no scheme short link', `youtu.be/${ID}`],
  ])('accepts %s', (_label, input) => {
    expect(parseYoutubeVideoId(input)).toBe(ID);
  });

  it.each([
    ['another host', `https://vimeo.com/${ID}`],
    ['a lookalike host', `https://notyoutube.com/watch?v=${ID}`],
    ['a playlist', 'https://www.youtube.com/playlist?list=PL1234567890'],
    ['a channel', 'https://www.youtube.com/@leagueszn'],
    ['a 10-char id', 'https://www.youtube.com/watch?v=dQw4w9WgXc'],
    ['a 12-char id', 'https://www.youtube.com/watch?v=dQw4w9WgXcQQ'],
    ['a bare 10-char id', 'dQw4w9WgXc'],
    ['a javascript: URL', `javascript:alert('${ID}')`],
    ['a data: URL', `data:text/html,${ID}`],
    ['watch without v', 'https://www.youtube.com/watch?t=30'],
    ['an empty string', ''],
    ['an id with bad characters', 'https://youtu.be/dQw4w9WgX!Q'],
    ['the home page', 'https://www.youtube.com/'],
  ])('rejects %s', (_label, input) => {
    expect(parseYoutubeVideoId(input)).toBeNull();
  });
});

describe('URL builders', () => {
  it('builds watch and thumbnail URLs from the id', () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});

describe('fetchYoutubeOEmbed', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('returns the title and channel on 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { title: ' Night 1 ', author_name: 'League SZN' }));

    expect(await fetchYoutubeOEmbed(ID)).toEqual({ title: 'Night 1', channelName: 'League SZN' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`)}&format=json`,
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('leaves channelName out when oEmbed has no author', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { title: 'Night 1' }));

    expect(await fetchYoutubeOEmbed(ID)).toEqual({ title: 'Night 1' });
  });

  it.each([401, 403, 404, 500])('returns null on %i', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { error: 'nope' }));

    expect(await fetchYoutubeOEmbed(ID)).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    expect(await fetchYoutubeOEmbed(ID)).toBeNull();
  });

  it('returns null when the request times out', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }));

    expect(await fetchYoutubeOEmbed(ID, 5)).toBeNull();
  });

  it.each([
    ['a missing title', { author_name: 'x' }],
    ['a numeric title', { title: 42 }],
    ['a blank title', { title: '   ' }],
    ['an array', [1, 2]],
    ['null', null],
  ])('returns null for %s', async (_label, body) => {
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    expect(await fetchYoutubeOEmbed(ID)).toBeNull();
  });

  it('returns null for a body that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));

    expect(await fetchYoutubeOEmbed(ID)).toBeNull();
  });
});
