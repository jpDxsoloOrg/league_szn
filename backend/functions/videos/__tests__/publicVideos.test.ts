import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent } from '../../rivalries/__tests__/testHelpers';

const mockVideos = { listPublished: vi.fn(), findById: vi.fn() };
const mockPlayers = { findByUserId: vi.fn() };

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    content: { videos: mockVideos },
    roster: { players: mockPlayers },
  }),
}));

import { handler as getPublishedVideos } from '../getPublishedVideos';
import { handler as getVideo } from '../getVideo';

const accountId = '11111111-2222-3333-4444-555555555555';
const video = { videoId: 'v1', title: 'Highlights', isPublished: 'true', uploadedBy: accountId };

describe('public video reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVideos.listPublished.mockResolvedValue([video]);
    mockVideos.findById.mockResolvedValue(video);
  });

  it('leaves uploadedBy out of GET /videos', async () => {
    const res = await getPublishedVideos(makeEvent({ httpMethod: 'GET' }), ctx, cb);

    expect(res!.statusCode).toBe(200);
    expect(res!.body).not.toContain(accountId);
    expect(JSON.parse(res!.body)[0].videoId).toBe('v1');
  });

  it('leaves uploadedBy out of GET /videos/{id}', async () => {
    const res = await getVideo(
      makeEvent({ httpMethod: 'GET', pathParameters: { videoId: 'v1' } }),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(200);
    expect(res!.body).not.toContain(accountId);
  });

  it('still hides a draft from anonymous readers', async () => {
    mockVideos.findById.mockResolvedValue({ ...video, isPublished: 'false' });

    const res = await getVideo(
      makeEvent({ httpMethod: 'GET', pathParameters: { videoId: 'v1' } }),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(404);
  });
});
