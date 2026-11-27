import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import type { Episode, Video } from '../../../lib/repositories/types';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import { handler as getEpisode } from '../getEpisode';
import { seedEpisode, seedVideo } from './episodeTestHelpers';

interface Detail {
  episode: Episode;
  highlights: Video[];
}

let repos: Repositories;

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
});

const request = (episodeId: string, auth = {}) =>
  call<Detail>(getEpisode, makeEvent({ ...auth, pathParameters: { episodeId } }));

describe('GET /episodes/{episodeId}', () => {
  it('404s a missing episode', async () => {
    expect((await request('missing')).statusCode).toBe(404);
  });

  it.each([
    ['anonymous callers', {}],
    ['invalid tokens', { headers: { Authorization: 'Bearer invalid' } }],
    ['wrestlers', bearer('wrestler-sub', 'Wrestler')],
  ])('404s a draft for %s', async (_label, auth) => {
    const { episodeId } = await seedEpisode(repos);

    expect((await request(episodeId, auth)).statusCode).toBe(404);
  });

  it.each(['Moderator', 'Admin'])('serves a draft to a %s', async (group) => {
    const { episodeId } = await seedEpisode(repos);

    const res = await request(episodeId, bearer('staff-sub', group));

    expect(res.statusCode).toBe(200);
    expect(res.body.episode.isPublished).toBe('false');
  });

  it('returns only published highlights linked to this episode, without private ids', async () => {
    const { episodeId } = await seedEpisode(repos, { isPublished: true });
    const other = await seedEpisode(repos, { youtubeVideoId: 'zzzzzzzzzzz', isPublished: true });
    const linked = await seedVideo(repos, { episodeId, title: 'Linked' });
    await seedVideo(repos, { episodeId, title: 'Draft', isPublished: false });
    await seedVideo(repos, { episodeId: other.episodeId, title: 'Other' });
    await seedVideo(repos, { title: 'Unlinked' });

    const res = await request(episodeId);

    expect(res.statusCode).toBe(200);
    expect(res.body.episode.episodeId).toBe(episodeId);
    expect(res.body.highlights.map((video) => video.videoId)).toEqual([linked.videoId]);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('gm-sub-secret');
    expect(raw).not.toContain('uploader-secret');
    expect(res.body.episode).not.toHaveProperty('createdBy');
    expect(res.body.highlights[0]).not.toHaveProperty('uploadedBy');
  });
});
