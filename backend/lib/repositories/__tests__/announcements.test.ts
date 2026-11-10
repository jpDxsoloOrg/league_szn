import { describe, it, expect, vi } from 'vitest';
import type { Announcement } from '../types';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../dynamodb', () => ({
  dynamoDb: { query: mockQuery },
  TableNames: { ANNOUNCEMENTS: 'Announcements' },
}));

import { compareActiveAnnouncements } from '../ContentRepository';
import { DynamoContentRepository } from '../dynamo/DynamoContentRepository';
import { InMemoryContentRepository } from '../inMemory/InMemoryContentRepository';

const row = (announcementId: string, priority: number | undefined, createdAt: string): Announcement => ({
  announcementId,
  title: announcementId,
  body: 'Body',
  priority,
  isActive: 'true',
  createdBy: 'staff',
  createdAt,
  updatedAt: createdAt,
} as Announcement);

const OLD = '2026-01-01T00:00:00.000Z';
const MID = '2026-06-01T00:00:00.000Z';
const NEW = '2026-11-01T00:00:00.000Z';

describe('active announcement order', () => {
  // The oldest first, as the table can hand them back.
  const rows = [
    row('old', 3, OLD),
    row('mid', 3, MID),
    row('urgent-but-old', 5, OLD),
    row('new', 3, NEW),
    row('low-but-new', 1, NEW),
  ];
  const expected = ['urgent-but-old', 'new', 'mid', 'old', 'low-but-new'];

  it('puts priority first and the newest first within a priority', () => {
    expect([...rows].sort(compareActiveAnnouncements).map((item) => item.announcementId)).toEqual(expected);
  });

  it('treats a missing priority as 1', () => {
    const sorted = [row('missing', undefined, NEW), row('one', 1, OLD)].sort(compareActiveAnnouncements);

    expect(sorted.map((item) => item.announcementId)).toEqual(['missing', 'one']);
  });

  it('applies to the in-memory repository', async () => {
    const repo = new InMemoryContentRepository();
    rows.forEach((item) => repo.announcements.store.set(item.announcementId, item));

    expect((await repo.announcements.listActive()).map((item) => item.announcementId)).toEqual(expected);
  });

  it('applies to the DynamoDB repository', async () => {
    mockQuery.mockResolvedValue({ Items: rows });

    const items = await new DynamoContentRepository().announcements.listActive();

    expect(items.map((item) => item.announcementId)).toEqual(expected);
  });
});
