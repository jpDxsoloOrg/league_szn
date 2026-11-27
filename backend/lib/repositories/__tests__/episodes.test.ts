import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUpdate, mockPut, mockQueryAll } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockPut: vi.fn(),
  mockQueryAll: vi.fn(),
}));

vi.mock('../../dynamodb', () => ({
  dynamoDb: { update: mockUpdate, put: mockPut, queryAll: mockQueryAll },
  TableNames: { EPISODES: 'Episodes', VIDEOS: 'Videos' },
}));

import { DynamoContentRepository } from '../dynamo/DynamoContentRepository';
import { InMemoryContentRepository } from '../inMemory/InMemoryContentRepository';
import type { EpisodeCreateInput } from '../ContentRepository';

const input = (overrides: Partial<EpisodeCreateInput> = {}): EpisodeCreateInput => ({
  youtubeVideoId: 'dQw4w9WgXcQ',
  title: ' Night 1 ',
  thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  airDate: '2026-11-01',
  createdBy: 'gm-sub',
  ...overrides,
});

describe('in-memory episodes', () => {
  let content: InMemoryContentRepository;

  beforeEach(() => {
    content = new InMemoryContentRepository();
  });

  it('creates a youtube draft with defaults', async () => {
    const episode = await content.episodes.create(input());

    expect(episode).toMatchObject({
      source: 'youtube',
      title: 'Night 1',
      description: '',
      isPublished: 'false',
      createdBy: 'gm-sub',
    });
    expect('eventId' in episode).toBe(false);
    expect('channelName' in episode).toBe(false);
  });

  it('publishes on create only with isPublished: true', async () => {
    expect((await content.episodes.create(input({ isPublished: true }))).isPublished).toBe('true');
  });

  it('lists published episodes newest air date first, without drafts', async () => {
    await content.episodes.create(input({ youtubeVideoId: 'aaaaaaaaaaa', airDate: '2026-10-01', isPublished: true }));
    await content.episodes.create(input({ youtubeVideoId: 'bbbbbbbbbbb', airDate: '2026-12-01', isPublished: true }));
    await content.episodes.create(input({ youtubeVideoId: 'ccccccccccc', airDate: '2026-12-31' }));

    const published = await content.episodes.listPublished();

    expect(published.map((episode) => episode.youtubeVideoId)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa']);
  });

  it('lists the episodes linked to an event', async () => {
    await content.episodes.create(input({ youtubeVideoId: 'aaaaaaaaaaa', eventId: 'event-1' }));
    await content.episodes.create(input({ youtubeVideoId: 'bbbbbbbbbbb', eventId: 'event-2' }));
    await content.episodes.create(input({ youtubeVideoId: 'ccccccccccc' }));

    const linked = await content.episodes.listByEvent('event-1');

    expect(linked.map((episode) => episode.youtubeVideoId)).toEqual(['aaaaaaaaaaa']);
  });

  it('removes eventId when the patch sends null', async () => {
    const { episodeId } = await content.episodes.create(input({ eventId: 'event-1' }));

    const updated = await content.episodes.update(episodeId, { eventId: null });

    expect('eventId' in updated).toBe(false);
    expect('eventId' in (await content.episodes.findById(episodeId))!).toBe(false);
    expect(await content.episodes.listByEvent('event-1')).toEqual([]);
  });

  it('finds an episode by its YouTube id', async () => {
    const created = await content.episodes.create(input());

    expect((await content.episodes.findByYoutubeId('dQw4w9WgXcQ'))?.episodeId).toBe(created.episodeId);
    expect(await content.episodes.findByYoutubeId('zzzzzzzzzzz')).toBeNull();
  });

  it('throws NotFoundError when updating a missing episode', async () => {
    await expect(content.episodes.update('missing', { title: 'x' })).rejects.toThrow('not found');
  });

  it('stores and removes a video episodeId', async () => {
    const video = await content.videos.create({
      title: 'Clip',
      videoUrl: 'https://example.com/clip.mp4',
      category: 'highlight',
      uploadedBy: 'gm',
      episodeId: 'episode-1',
    });
    expect(video.episodeId).toBe('episode-1');

    const cleared = await content.videos.update(video.videoId, { episodeId: null });

    expect('episodeId' in cleared).toBe(false);
    expect('episodeId' in (await content.videos.findById(video.videoId))!).toBe(false);
  });
});

describe('Dynamo episodes and videos null links', () => {
  const content = new DynamoContentRepository();

  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ Attributes: {} });
  });

  it('REMOVEs eventId instead of writing a NULL GSI key', async () => {
    await content.episodes.update('episode-1', { eventId: null });

    const params = mockUpdate.mock.calls[0][0];
    expect(params.TableName).toBe('Episodes');
    expect(params.UpdateExpression).toMatch(/^SET .+ REMOVE eventId$/);
    expect(params.ExpressionAttributeValues).not.toHaveProperty(':eventId');
    expect(params.ExpressionAttributeNames).not.toHaveProperty('#eventId');
    expect(params.ConditionExpression).toBe('attribute_exists(episodeId)');
  });

  it('SETs eventId when linking', async () => {
    await content.episodes.update('episode-1', { eventId: 'event-1', isPublished: false });

    const params = mockUpdate.mock.calls[0][0];
    expect(params.UpdateExpression).not.toContain('REMOVE');
    expect(params.ExpressionAttributeValues).toMatchObject({ ':eventId': 'event-1', ':isPublished': 'false' });
  });

  it('REMOVEs a video episodeId on null', async () => {
    await content.videos.update('video-1', { episodeId: null });

    const params = mockUpdate.mock.calls[0][0];
    expect(params.TableName).toBe('Videos');
    expect(params.UpdateExpression).toMatch(/^SET .+ REMOVE episodeId$/);
    expect(params.ExpressionAttributeValues).not.toHaveProperty(':episodeId');
  });

  it('maps a failed condition to NotFoundError', async () => {
    mockUpdate.mockRejectedValue(Object.assign(new Error('cc'), { name: 'ConditionalCheckFailedException' }));

    await expect(content.episodes.update('missing', { title: 'x' })).rejects.toThrow('not found');
  });

  it('queries PublishedIndex for published episodes', async () => {
    mockQueryAll.mockResolvedValue([
      { episodeId: 'a', airDate: '2026-10-01', createdAt: '1' },
      { episodeId: 'b', airDate: '2026-11-01', createdAt: '1' },
    ]);

    const rows = await content.episodes.listPublished();

    expect(mockQueryAll.mock.calls[0][0]).toMatchObject({ IndexName: 'PublishedIndex', TableName: 'Episodes' });
    expect(rows.map((row) => row.episodeId)).toEqual(['b', 'a']);
  });
});
