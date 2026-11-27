import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { episodesApi, liveStreamApi } from '../api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
type FetchMock = ReturnType<typeof vi.fn>;

function mockRes(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

const fetchMock = () => global.fetch as FetchMock;
const callUrl = (i = 0) => fetchMock().mock.calls[i][0] as string;
const callOpts = (i = 0) => fetchMock().mock.calls[i][1] as RequestInit;
const callBody = (i = 0) => JSON.parse(callOpts(i).body as string);

const rawEpisode = (isPublished: boolean | 'true' | 'false') => ({
  episodeId: 'e1',
  source: 'youtube',
  youtubeVideoId: 'dQw4w9WgXcQ',
  title: 'Night 1',
  description: '',
  thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  airDate: '2026-11-20',
  isPublished,
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});
afterEach(() => { sessionStorage.clear(); });

describe('episodesApi', () => {
  it('getPublished calls /episodes and normalises isPublished', async () => {
    fetchMock().mockResolvedValue(mockRes([rawEpisode('true')]));
    const episodes = await episodesApi.getPublished();
    expect(callUrl()).toBe(`${API_BASE}/episodes`);
    expect(episodes[0].isPublished).toBe(true);
  });

  it('getByEvent passes the event id as a query parameter', async () => {
    fetchMock().mockResolvedValue(mockRes([]));
    await episodesApi.getByEvent('ev 1');
    expect(callUrl()).toBe(`${API_BASE}/episodes?eventId=ev%201`);
  });

  it('getById normalises the episode and its highlights', async () => {
    fetchMock().mockResolvedValue(mockRes({
      episode: rawEpisode('false'),
      highlights: [{ videoId: 'v1', isPublished: 'true' }],
    }));
    const detail = await episodesApi.getById('e1');
    expect(callUrl()).toBe(`${API_BASE}/episodes/e1`);
    expect(detail.episode.isPublished).toBe(false);
    expect(detail.highlights[0].isPublished).toBe(true);
  });

  it('getAll calls the admin list and turns "false" into a draft', async () => {
    fetchMock().mockResolvedValue(mockRes([rawEpisode('false')]));
    const episodes = await episodesApi.getAll();
    expect(callUrl()).toBe(`${API_BASE}/admin/episodes`);
    expect(episodes[0].isPublished).toBe(false);
  });

  it('lookup posts the URL to the YouTube lookup', async () => {
    fetchMock().mockResolvedValue(mockRes({ youtubeVideoId: 'dQw4w9WgXcQ', oembedAvailable: true }));
    await episodesApi.lookup('https://youtu.be/dQw4w9WgXcQ');
    expect(callUrl()).toBe(`${API_BASE}/admin/episodes/youtube-lookup`);
    expect(callOpts().method).toBe('POST');
    expect(callBody()).toEqual({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  });

  it('create, update and delete hit the admin routes', async () => {
    fetchMock()
      .mockResolvedValueOnce(mockRes(rawEpisode('false'), 201))
      .mockResolvedValueOnce(mockRes(rawEpisode('true')))
      .mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() });

    const created = await episodesApi.create({ url: 'dQw4w9WgXcQ', title: 'Night 1', isPublished: false });
    expect(callUrl(0)).toBe(`${API_BASE}/admin/episodes`);
    expect(callOpts(0).method).toBe('POST');
    expect(created.isPublished).toBe(false);

    await episodesApi.update('e1', { eventId: null });
    expect(callUrl(1)).toBe(`${API_BASE}/admin/episodes/e1`);
    expect(callOpts(1).method).toBe('PUT');
    expect(callBody(1)).toEqual({ eventId: null });

    await episodesApi.delete('e1');
    expect(callUrl(2)).toBe(`${API_BASE}/admin/episodes/e1`);
    expect(callOpts(2).method).toBe('DELETE');
  });
});

describe('liveStreamApi', () => {
  it('get reads the public live stream and update writes the admin route', async () => {
    fetchMock()
      .mockResolvedValueOnce(mockRes({ channel: 'league', isLive: false }))
      .mockResolvedValueOnce(mockRes({ channel: 'league', isLive: true }));
    await liveStreamApi.get();
    expect(callUrl(0)).toBe(`${API_BASE}/live-stream`);
    await liveStreamApi.update({ isLive: true });
    expect(callUrl(1)).toBe(`${API_BASE}/admin/live-stream`);
    expect(callOpts(1).method).toBe('PUT');
    expect(callBody(1)).toEqual({ isLive: true });
  });
});
