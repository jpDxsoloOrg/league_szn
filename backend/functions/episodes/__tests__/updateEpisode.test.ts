import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { Episode } from '../../../lib/repositories/types';
import { handler as updateEpisode } from '../updateEpisode';
import { callStaff, OTHER_VIDEO_ID, seedEpisode, seedEvent, VIDEO_ID } from './episodeTestHelpers';

type Body = Episode & { message?: string; existingEpisodeId?: string };

let repos: Repositories;

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
});

const update = (episodeId: string, body: unknown, groups?: string) =>
  callStaff<Body>(updateEpisode, { method: 'PUT', pathParameters: { episodeId }, body, groups });

describe('PUT /admin/episodes/{episodeId}', () => {
  it('404s a missing episode', async () => {
    expect((await update('missing', { title: 'x' })).statusCode).toBe(404);
  });

  it('rejects an empty patch with 400', async () => {
    const { episodeId } = await seedEpisode(repos);

    const res = await update(episodeId, {});

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('No fields to update');
  });

  it('updates title, description, airDate and isPublished', async () => {
    const { episodeId } = await seedEpisode(repos);

    const res = await update(episodeId, {
      title: ' Renamed ',
      description: 'New text',
      airDate: '2026-11-20',
      isPublished: true,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Renamed',
      description: 'New text',
      airDate: '2026-11-20',
      isPublished: 'true',
    });
  });

  it('keeps a draft a draft with isPublished: false and rejects strings', async () => {
    const { episodeId } = await seedEpisode(repos);

    expect((await update(episodeId, { title: 'x', isPublished: 'false' })).statusCode).toBe(400);
    expect((await update(episodeId, { title: 'x', isPublished: false })).body.isPublished).toBe('false');
  });

  it('links and unlinks an event with null', async () => {
    const eventId = await seedEvent(repos);
    const { episodeId } = await seedEpisode(repos);

    expect((await update(episodeId, { eventId })).body.eventId).toBe(eventId);

    const res = await update(episodeId, { eventId: null });

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toHaveProperty('eventId');
    expect(await repos.content.episodes.listByEvent(eventId)).toEqual([]);
  });

  it("unlinks an event with eventId ''", async () => {
    const eventId = await seedEvent(repos);
    const { episodeId } = await seedEpisode(repos, { eventId });

    const res = await update(episodeId, { eventId: '' });

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toHaveProperty('eventId');
  });

  it('rejects an unknown event', async () => {
    const { episodeId } = await seedEpisode(repos);

    const res = await update(episodeId, { eventId: 'no-such-event' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Event not found');
  });

  it('changes the video and rebuilds the thumbnail, keeping the title', async () => {
    const { episodeId } = await seedEpisode(repos);

    const res = await update(episodeId, { url: `https://youtu.be/${OTHER_VIDEO_ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      youtubeVideoId: OTHER_VIDEO_ID,
      thumbnailUrl: `https://i.ytimg.com/vi/${OTHER_VIDEO_ID}/hqdefault.jpg`,
      title: 'Night 1',
    });
  });

  it('accepts its own video again but refuses another episode\'s', async () => {
    const { episodeId } = await seedEpisode(repos);
    const other = await seedEpisode(repos, { youtubeVideoId: OTHER_VIDEO_ID });

    expect((await update(episodeId, { url: VIDEO_ID, title: 'Same' })).statusCode).toBe(200);

    const res = await update(episodeId, { url: OTHER_VIDEO_ID });
    expect(res.statusCode).toBe(400);
    expect(res.body.existingEpisodeId).toBe(other.episodeId);
  });

  it('rejects a bad url, a blank title and a bad airDate', async () => {
    const { episodeId } = await seedEpisode(repos);

    expect((await update(episodeId, { url: 'https://vimeo.com/1' })).statusCode).toBe(400);
    expect((await update(episodeId, { title: '  ' })).statusCode).toBe(400);
    expect((await update(episodeId, { airDate: '2026-02-30' })).statusCode).toBe(400);
  });

  it('refuses a Wrestler', async () => {
    const { episodeId } = await seedEpisode(repos);

    expect((await update(episodeId, { title: 'x' }, 'Wrestler')).statusCode).toBe(403);
  });
});
