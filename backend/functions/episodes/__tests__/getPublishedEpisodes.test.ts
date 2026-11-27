import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { Episode } from '../../../lib/repositories/types';
import { call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import { handler as getPublishedEpisodes } from '../getPublishedEpisodes';
import { seedEpisode } from './episodeTestHelpers';

let repos: Repositories;

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
});

describe('GET /episodes', () => {
  it('returns 200 with queryStringParameters: null', async () => {
    const res = await call<Episode[]>(getPublishedEpisodes, makeEvent({ queryStringParameters: null }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lists published episodes newest air date first, without drafts or createdBy', async () => {
    await seedEpisode(repos, { youtubeVideoId: 'aaaaaaaaaaa', airDate: '2026-10-01', isPublished: true });
    await seedEpisode(repos, { youtubeVideoId: 'bbbbbbbbbbb', airDate: '2026-11-15', isPublished: true });
    await seedEpisode(repos, { youtubeVideoId: 'ccccccccccc', airDate: '2026-12-01' });

    const res = await call<Episode[]>(getPublishedEpisodes, makeEvent());

    expect(res.body.map((episode) => episode.youtubeVideoId)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa']);
    expect(JSON.stringify(res.body)).not.toContain('gm-sub-secret');
    expect(res.body[0]).not.toHaveProperty('createdBy');
  });

  it('filters by ?eventId= and still hides drafts', async () => {
    await seedEpisode(repos, { youtubeVideoId: 'aaaaaaaaaaa', airDate: '2026-10-01', eventId: 'event-1', isPublished: true });
    await seedEpisode(repos, { youtubeVideoId: 'bbbbbbbbbbb', airDate: '2026-11-01', eventId: 'event-1', isPublished: true });
    await seedEpisode(repos, { youtubeVideoId: 'ccccccccccc', airDate: '2026-12-01', eventId: 'event-1' });
    await seedEpisode(repos, { youtubeVideoId: 'ddddddddddd', eventId: 'event-2', isPublished: true });

    const res = await call<Episode[]>(
      getPublishedEpisodes,
      makeEvent({ queryStringParameters: { eventId: 'event-1' } }),
    );

    expect(res.body.map((episode) => episode.youtubeVideoId)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa']);
    expect(res.body[0]).not.toHaveProperty('createdBy');
  });
});
