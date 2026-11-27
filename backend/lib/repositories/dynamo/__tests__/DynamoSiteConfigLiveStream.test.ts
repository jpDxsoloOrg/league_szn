import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPut } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPut: vi.fn() }));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { get: mockGet, put: mockPut },
  TableNames: { SITE_CONFIG: 'SiteConfig' },
}));

import { DynamoUserRepository } from '../DynamoUserRepository';
import { InMemoryUserRepository } from '../../inMemory/InMemoryUserRepository';
import type { LiveStreamSettings } from '../../SiteConfigRepository';

const live: LiveStreamSettings = {
  channel: 'leagueszn',
  isLive: true,
  title: 'Night 1',
  liveSince: '2026-11-27T20:42:00.000Z',
  updatedBy: 'mod-sub',
  updatedAt: '2026-11-27T20:42:00.000Z',
};

describe('siteConfig live stream', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
  });

  it('defaults to an empty, offline channel in both drivers', async () => {
    mockGet.mockResolvedValue({});

    expect(await new DynamoUserRepository().siteConfig.getLiveStream()).toEqual({ channel: '', isLive: false });
    expect(await new InMemoryUserRepository().siteConfig.getLiveStream()).toEqual({ channel: '', isLive: false });
  });

  it('round-trips the same settings in both drivers', async () => {
    const dynamo = new DynamoUserRepository().siteConfig;
    const memory = new InMemoryUserRepository().siteConfig;

    expect(await dynamo.setLiveStream(live)).toEqual(live);
    expect(await memory.setLiveStream(live)).toEqual(live);

    const item = mockPut.mock.calls[0][0].Item;
    expect(item).toMatchObject({ configKey: 'liveStream', settings: live });
    mockGet.mockResolvedValue({ Item: item });
    expect(await dynamo.getLiveStream()).toEqual(live);
    expect(await memory.getLiveStream()).toEqual(live);
  });

  it('replaces the row, dropping fields left undefined', async () => {
    const dynamo = new DynamoUserRepository().siteConfig;
    const memory = new InMemoryUserRepository().siteConfig;
    await memory.setLiveStream(live);
    const offline: LiveStreamSettings = { channel: 'leagueszn', isLive: false, title: undefined };

    await dynamo.setLiveStream(offline);
    await memory.setLiveStream(offline);

    const stored = mockPut.mock.calls[0][0].Item.settings;
    expect(stored).toEqual({ channel: 'leagueszn', isLive: false });
    expect('title' in stored).toBe(false);
    expect(await memory.getLiveStream()).not.toHaveProperty('liveSince');
  });
});
