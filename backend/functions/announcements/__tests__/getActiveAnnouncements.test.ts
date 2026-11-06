import { describe, it, expect, vi } from 'vitest';
import { ctx, cb, makeEvent } from '../../rivalries/__tests__/testHelpers';

const accountId = '11111111-2222-3333-4444-555555555555';
const mockAnnouncements = {
  listActive: vi.fn(async () => [{ announcementId: 'a1', title: 'News', createdBy: accountId }]),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({ content: { announcements: mockAnnouncements } }),
}));

import { handler as getActiveAnnouncements } from '../getActiveAnnouncements';

describe('getActiveAnnouncements', () => {
  it('leaves createdBy out of the public payload', async () => {
    const res = await getActiveAnnouncements(makeEvent({ httpMethod: 'GET' }), ctx, cb);

    expect(res!.statusCode).toBe(200);
    expect(res!.body).not.toContain(accountId);
    expect(JSON.parse(res!.body)[0].announcementId).toBe('a1');
  });
});
