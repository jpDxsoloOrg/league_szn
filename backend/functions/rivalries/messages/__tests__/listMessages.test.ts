import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from '../../__tests__/testHelpers';

const mockRivalries = { get: vi.fn() };
const mockMessages = { list: vi.fn() };
const mockPlayers = { findByUserId: vi.fn() };

vi.mock('../../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    rivalryMessages: mockMessages,
    roster: { players: mockPlayers },
  }),
}));

import { handler as listMessages } from '../listMessages';

const rivalry = {
  rivalryId: 'r1',
  title: 'feud',
  status: 'active',
  heat: 'warm',
  requestedBy: 'p1',
  participants: [
    { playerId: 'p1', role: 'instigator', addedAt: '' },
    { playerId: 'p2', role: 'rival', addedAt: '' },
  ],
  createdAt: '',
  updatedAt: '',
};

function listEvent(query: Record<string, string> = {}) {
  return makeEvent({
    httpMethod: 'GET',
    pathParameters: { rivalryId: 'r1' },
    queryStringParameters: query,
  });
}

describe('listMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRivalries.get.mockResolvedValue(rivalry);
    mockPlayers.findByUserId.mockResolvedValue(null);
  });

  it('returns 403 for a non-participant non-GM caller', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p99', userId: 'user-other' });

    const res = await listMessages(
      withAuth(listEvent(), 'Wrestler', 'user-other'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(403);
    expect(mockMessages.list).not.toHaveBeenCalled();
  });

  it('returns 404 when the rivalry does not exist', async () => {
    mockRivalries.get.mockResolvedValueOnce(undefined);
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });

    const res = await listMessages(
      withAuth(listEvent(), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(404);
  });

  it('hides admins-only messages from a participant who is not the author', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });
    mockMessages.list.mockResolvedValue({
      items: [
        {
          rivalryId: 'r1',
          messageId: 'm-admins-from-p2',
          authorPlayerId: 'p2',
          body: 'private gm thing',
          audience: 'admins',
          createdAt: '2026-05-01T00:00:00.000Z',
        },
        {
          rivalryId: 'r1',
          messageId: 'm-all',
          authorPlayerId: 'p2',
          body: 'public',
          audience: 'all',
          createdAt: '2026-05-02T00:00:00.000Z',
        },
      ],
      nextCursor: undefined,
    });

    const res = await listMessages(
      withAuth(listEvent(), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    const body = JSON.parse(res!.body);
    const ids = body.messages.map((m: { messageId: string }) => m.messageId);
    expect(ids).toContain('m-all');
    expect(ids).not.toContain('m-admins-from-p2');
  });

  it('lets the author see their own admins-only message', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });
    mockMessages.list.mockResolvedValue({
      items: [
        {
          rivalryId: 'r1',
          messageId: 'm-self-admins',
          authorPlayerId: 'p1',
          body: 'my note to GMs',
          audience: 'admins',
          createdAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      nextCursor: undefined,
    });

    const res = await listMessages(
      withAuth(listEvent(), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    const body = JSON.parse(res!.body);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].messageId).toBe('m-self-admins');
  });

  it('returns every audience to GMs', async () => {
    mockPlayers.findByUserId.mockResolvedValue(null);
    mockMessages.list.mockResolvedValue({
      items: [
        {
          rivalryId: 'r1',
          messageId: 'a',
          authorPlayerId: 'p1',
          body: '',
          audience: 'admins',
          createdAt: '',
        },
        {
          rivalryId: 'r1',
          messageId: 'b',
          authorPlayerId: 'p2',
          body: '',
          audience: 'participants',
          createdAt: '',
        },
        {
          rivalryId: 'r1',
          messageId: 'c',
          authorPlayerId: 'p1',
          body: '',
          audience: 'all',
          createdAt: '',
        },
      ],
      nextCursor: undefined,
    });

    const res = await listMessages(
      withAuth(listEvent(), 'Admin', 'gm-sub'),
      ctx,
      cb,
    );

    const body = JSON.parse(res!.body);
    expect(body.messages).toHaveLength(3);
  });

  it('passes cursor + limit through to the repo', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });
    mockMessages.list.mockResolvedValue({ items: [], nextCursor: 'next-cursor' });

    const res = await listMessages(
      withAuth(listEvent({ cursor: 'page-1', limit: '10' }), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(200);
    expect(mockMessages.list).toHaveBeenCalledWith('r1', { limit: 10, cursor: 'page-1' });
    const body = JSON.parse(res!.body);
    expect(body.nextCursor).toBe('next-cursor');
  });
});
