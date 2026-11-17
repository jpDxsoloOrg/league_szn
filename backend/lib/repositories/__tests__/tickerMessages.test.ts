import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TickerMessage } from '../types';

const { mockGet, mockPut, mockQuery, mockScanAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockQuery: vi.fn(),
  mockScanAll: vi.fn(),
}));

vi.mock('../../dynamodb', () => ({
  dynamoDb: { get: mockGet, put: mockPut, query: mockQuery, scanAll: mockScanAll },
  TableNames: { ANNOUNCEMENTS: 'Announcements' },
}));

import { compareTickerMessages, isTickerMessageActive } from '../ContentRepository';
import { DynamoContentRepository } from '../dynamo/DynamoContentRepository';
import { InMemoryContentRepository } from '../inMemory/InMemoryContentRepository';

const NOW = new Date('2026-11-16T12:00:00.000Z');

const message = (messageId: string, startsAt: string, expiresAt: string, pinned = false): TickerMessage => ({
  messageId,
  text: messageId,
  pinned,
  startsAt,
  expiresAt,
  createdBy: 'gm',
  createdAt: startsAt,
  updatedAt: startsAt,
});

const messages = [
  message('expired', '2026-11-01T00:00:00.000Z', '2026-11-16T11:59:59.999Z'),
  message('expires-now', '2026-11-01T00:00:00.000Z', NOW.toISOString()),
  message('scheduled', '2026-11-17T00:00:00.000Z', '2026-11-20T00:00:00.000Z'),
  message('old', '2026-11-10T00:00:00.000Z', '2026-11-30T00:00:00.000Z'),
  message('new', '2026-11-15T00:00:00.000Z', '2026-11-30T00:00:00.000Z'),
  message('pinned-old', '2026-11-02T00:00:00.000Z', '2026-11-30T00:00:00.000Z', true),
  message('starts-now', NOW.toISOString(), '2026-11-30T00:00:00.000Z'),
];
const expectedActive = ['pinned-old', 'starts-now', 'new', 'old'];

const tickerRow = (item: TickerMessage) => ({ ...item, announcementId: item.messageId, kind: 'ticker' });
const announcementRow = {
  announcementId: 'ann-1',
  title: 'News',
  body: 'Body',
  priority: 1,
  isActive: 'true',
  createdBy: 'gm',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ticker message helpers', () => {
  it('counts a message as active from startsAt up to (not including) expiresAt', () => {
    const nowIso = NOW.toISOString();
    expect(isTickerMessageActive(message('a', nowIso, '2026-12-01T00:00:00.000Z'), nowIso)).toBe(true);
    expect(isTickerMessageActive(message('b', '2026-11-01T00:00:00.000Z', nowIso), nowIso)).toBe(false);
  });

  it('puts pinned messages first, then the latest start', () => {
    const sorted = [...messages].sort(compareTickerMessages).map((item) => item.messageId);
    expect(sorted[0]).toBe('pinned-old');
  });
});

describe('in-memory tickerMessages.listActive', () => {
  it('drops expired and not-yet-started messages', async () => {
    const repo = new InMemoryContentRepository();
    messages.forEach((item) => repo.tickerMessages.store.set(item.messageId, item));

    const active = await repo.tickerMessages.listActive(NOW);
    expect(active.map((item) => item.messageId)).toEqual(expectedActive);
  });
});

describe('DynamoDB tickerMessages', () => {
  it('lists only ticker rows and filters expired ones from listActive', async () => {
    mockScanAll.mockResolvedValue([...messages.map(tickerRow), announcementRow]);
    const repo = new DynamoContentRepository();

    const active = await repo.tickerMessages.listActive(NOW);
    expect(active.map((item) => item.messageId)).toEqual(expectedActive);
    expect(active[0]).not.toHaveProperty('kind');
    expect(active[0]).not.toHaveProperty('announcementId');
    expect(mockScanAll).toHaveBeenCalledWith(expect.objectContaining({
      TableName: 'Announcements',
      FilterExpression: '#kind = :ticker',
    }));
  });

  it('writes a kind ticker row with no isActive, so it stays out of the ActiveIndex', async () => {
    const repo = new DynamoContentRepository();
    const created = await repo.tickerMessages.create({
      text: '  Draft night!  ',
      href: '/events',
      startsAt: '2026-11-16T00:00:00.000Z',
      expiresAt: '2026-11-20T00:00:00.000Z',
      createdBy: 'gm',
    });

    const item = mockPut.mock.calls[0][0].Item;
    expect(item).toMatchObject({ kind: 'ticker', announcementId: created.messageId, text: 'Draft night!', pinned: false });
    expect(item).not.toHaveProperty('isActive');
  });

  it('findById ignores announcement rows', async () => {
    mockGet.mockResolvedValue({ Item: announcementRow });
    expect(await new DynamoContentRepository().tickerMessages.findById('ann-1')).toBeNull();
  });
});

describe('DynamoDB announcements ignore ticker rows', () => {
  it('list() leaves ticker rows out', async () => {
    mockScanAll.mockResolvedValue([announcementRow, ...messages.map(tickerRow)]);
    const list = await new DynamoContentRepository().announcements.list();
    expect(list.map((item) => item.announcementId)).toEqual(['ann-1']);
  });

  it('findById() returns null for a ticker row', async () => {
    mockGet.mockResolvedValue({ Item: tickerRow(messages[3]) });
    expect(await new DynamoContentRepository().announcements.findById('old')).toBeNull();
  });

  it('listActive() leaves ticker rows out', async () => {
    mockQuery.mockResolvedValue({ Items: [announcementRow, { ...tickerRow(messages[3]), isActive: 'true' }] });
    const active = await new DynamoContentRepository().announcements.listActive();
    expect(active.map((item) => item.announcementId)).toEqual(['ann-1']);
  });
});
