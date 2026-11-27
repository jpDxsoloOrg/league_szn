import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { Video } from '../../../lib/repositories/types';
import { ctx, cb, makeEvent, withAuth } from '../../rivalries/__tests__/testHelpers';
import { handler as createVideo } from '../createVideo';
import { handler as updateVideo } from '../updateVideo';

let repos: Repositories;

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
});

const createDraft = (): Promise<Video> =>
  repos.content.videos.create({
    title: 'Draft clip',
    videoUrl: 'https://example.com/clip.mp4',
    category: 'highlight',
    isPublished: false,
    uploadedBy: 'player-1',
  });

async function put(videoId: string, body: unknown, groups = 'Moderator') {
  const res = await updateVideo(
    withAuth(makeEvent({ httpMethod: 'PUT', pathParameters: { videoId }, body: JSON.stringify(body) }), groups),
    ctx,
    cb,
  );
  return { statusCode: res!.statusCode, body: JSON.parse(res!.body) as Video & { message?: string } };
}

async function post(body: unknown, groups = 'Moderator') {
  const res = await createVideo(
    withAuth(makeEvent({ httpMethod: 'POST', body: JSON.stringify(body) }), groups),
    ctx,
    cb,
  );
  return { statusCode: res!.statusCode, body: JSON.parse(res!.body) as Video & { message?: string } };
}

const newVideo = { title: 'Clip', videoUrl: 'https://example.com/a.mp4', category: 'match' };

describe('updateVideo isPublished', () => {
  it.each([['false'], ['true'], [1], [null]])('rejects isPublished %j with 400', async (value) => {
    const { videoId } = await createDraft();

    const res = await put(videoId, { title: 'Edited', isPublished: value });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('isPublished must be a boolean');
    expect((await repos.content.videos.findById(videoId))?.isPublished).toBe('false');
  });

  it('keeps a draft a draft when isPublished: false is sent', async () => {
    const { videoId } = await createDraft();

    const res = await put(videoId, { title: 'Edited', isPublished: false });

    expect(res.statusCode).toBe(200);
    expect(res.body.isPublished).toBe('false');
    expect(await repos.content.videos.listPublished()).toEqual([]);
  });

  it('publishes with isPublished: true', async () => {
    const { videoId } = await createDraft();

    const res = await put(videoId, { isPublished: true });

    expect(res.body.isPublished).toBe('true');
  });
});

describe('createVideo isPublished', () => {
  it('rejects a string isPublished with 400', async () => {
    const res = await post({ ...newVideo, isPublished: 'false' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('isPublished must be a boolean');
  });

  it('creates a draft with isPublished: false', async () => {
    const res = await post({ ...newVideo, isPublished: false });

    expect(res.statusCode).toBe(201);
    expect(res.body.isPublished).toBe('false');
  });
});

describe('video episodeId', () => {
  const seedEpisode = () =>
    repos.content.episodes.create({
      youtubeVideoId: 'dQw4w9WgXcQ',
      title: 'Night 1',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      airDate: '2026-11-01',
      createdBy: 'gm',
    });

  it('lets staff link a new highlight to an episode', async () => {
    const { episodeId } = await seedEpisode();

    const res = await post({ ...newVideo, episodeId });

    expect(res.statusCode).toBe(201);
    expect(res.body.episodeId).toBe(episodeId);
  });

  it("ignores a wrestler's episodeId", async () => {
    const { episodeId } = await seedEpisode();
    const player = await repos.roster.players.create({ name: 'Uploader', currentWrestler: 'The Rock' });
    await repos.roster.players.update(player.playerId, { userId: 'user-sub-1', canUploadVideos: true });

    const res = await post({ ...newVideo, episodeId }, 'Wrestler');

    expect(res.statusCode).toBe(201);
    expect(res.body).not.toHaveProperty('episodeId');
    expect(res.body.isPublished).toBe('false');
  });

  it('rejects an unknown episode with 400 on create and update', async () => {
    expect((await post({ ...newVideo, episodeId: 'missing' })).body.message).toBe('Episode not found');

    const { videoId } = await createDraft();
    const res = await put(videoId, { episodeId: 'missing' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Episode not found');
  });

  it("treats episodeId '' as no link on create", async () => {
    const res = await post({ ...newVideo, episodeId: '' });

    expect(res.statusCode).toBe(201);
    expect(res.body).not.toHaveProperty('episodeId');
  });

  it.each([[null], ['']])('clears the link with episodeId %j and keeps a draft a draft', async (value) => {
    const { episodeId } = await seedEpisode();
    const { videoId } = await createDraft();
    await put(videoId, { episodeId, isPublished: false });
    expect((await repos.content.videos.findById(videoId))?.episodeId).toBe(episodeId);

    const res = await put(videoId, { episodeId: value, isPublished: false });

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toHaveProperty('episodeId');
    expect(res.body.isPublished).toBe('false');
  });

  it('links a draft to an episode without publishing it', async () => {
    const { episodeId } = await seedEpisode();
    const { videoId } = await createDraft();

    const res = await put(videoId, { title: 'Draft clip', episodeId, isPublished: false });

    expect(res.body).toMatchObject({ episodeId, isPublished: 'false' });
  });
});
