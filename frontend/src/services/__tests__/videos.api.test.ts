import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { videosApi } from '../api';
import { normalizeVideo } from '../api/videos.api';
import type { RawVideo } from '../api/videos.api';

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

const rawVideo = (isPublished: RawVideo['isPublished']): RawVideo => ({
  videoId: 'v1',
  title: 'Cage match',
  description: '',
  videoUrl: '/videos/v1.mp4',
  category: 'match',
  tags: [],
  isPublished,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});
afterEach(() => { sessionStorage.clear(); });

describe('normalizeVideo', () => {
  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
  ] as const)('maps isPublished %s to %s', (stored, expected) => {
    expect(normalizeVideo(rawVideo(stored)).isPublished).toBe(expected);
  });
});

describe('videosApi', () => {
  it('getAll turns the stored string "false" into a boolean draft', async () => {
    fetchMock().mockResolvedValue(mockRes([rawVideo('false'), rawVideo('true')]));
    const videos = await videosApi.getAll();
    expect(videos.map((video) => video.isPublished)).toEqual([false, true]);
  });

  it('getPublished and getById normalise too', async () => {
    fetchMock()
      .mockResolvedValueOnce(mockRes([rawVideo('true')]))
      .mockResolvedValueOnce(mockRes(rawVideo('false')));
    expect((await videosApi.getPublished())[0].isPublished).toBe(true);
    expect((await videosApi.getById('v1')).isPublished).toBe(false);
  });

  it('update sends episodeId null to clear a link and normalises the reply', async () => {
    fetchMock().mockResolvedValue(mockRes(rawVideo('false')));
    const updated = await videosApi.update('v1', { episodeId: null, isPublished: false });
    const body = JSON.parse((fetchMock().mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ episodeId: null, isPublished: false });
    expect(updated.isPublished).toBe(false);
  });
});
