import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as deleteEpisode } from '../deleteEpisode';
import { callStaff, OTHER_VIDEO_ID, seedEpisode, seedVideo } from './episodeTestHelpers';

let repos: Repositories;

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
});

const remove = (episodeId: string, groups?: string) =>
  callStaff(deleteEpisode, { method: 'DELETE', pathParameters: { episodeId }, groups });

describe('DELETE /admin/episodes/{episodeId}', () => {
  it('unlinks its highlights, keeps every video, then deletes the episode', async () => {
    const { episodeId } = await seedEpisode(repos);
    const other = await seedEpisode(repos, { youtubeVideoId: OTHER_VIDEO_ID });
    const published = await seedVideo(repos, { episodeId });
    const draft = await seedVideo(repos, { episodeId, isPublished: false });
    const elsewhere = await seedVideo(repos, { episodeId: other.episodeId });

    const res = await remove(episodeId);

    expect(res.statusCode).toBe(204);
    expect(await repos.content.episodes.findById(episodeId)).toBeNull();
    const videos = await repos.content.videos.list();
    expect(videos).toHaveLength(3);
    expect('episodeId' in (await repos.content.videos.findById(published.videoId))!).toBe(false);
    expect('episodeId' in (await repos.content.videos.findById(draft.videoId))!).toBe(false);
    expect((await repos.content.videos.findById(elsewhere.videoId))?.episodeId).toBe(other.episodeId);
  });

  it('404s a missing episode', async () => {
    expect((await remove('missing')).statusCode).toBe(404);
  });

  it('refuses a Wrestler', async () => {
    const { episodeId } = await seedEpisode(repos);

    expect((await remove(episodeId, 'Wrestler')).statusCode).toBe(403);
    expect(await repos.content.episodes.findById(episodeId)).not.toBeNull();
  });
});
