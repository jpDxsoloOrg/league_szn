import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from './testHelpers';

const mockRivalries = {
  listByParticipant: vi.fn(),
  listByStatus: vi.fn(),
};
const mockMessages = { list: vi.fn() };
const mockNotes = { listByRivalry: vi.fn() };
const mockMatches = { list: vi.fn() };
const mockPromos = { listByPlayer: vi.fn() };
const mockPlayers = { findByUserId: vi.fn() };

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    rivalryMessages: mockMessages,
    rivalryNotes: mockNotes,
    competition: { matches: mockMatches },
    content: { promos: mockPromos },
    roster: { players: mockPlayers },
  }),
}));

vi.mock('../../../lib/authenticate', () => ({
  authenticate: vi.fn().mockResolvedValue({ ok: true }),
}));

import { handler as getRivalryActivity, _resetMemoForTesting } from '../getRivalryActivity';

function makeRivalry(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe('getRivalryActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetMemoForTesting();
    mockMessages.list.mockResolvedValue({ items: [], nextCursor: undefined });
    mockNotes.listByRivalry.mockResolvedValue([]);
    mockMatches.list.mockResolvedValue([]);
    mockPromos.listByPlayer.mockResolvedValue([]);
    mockPlayers.findByUserId.mockResolvedValue(null);
  });

  it('returns an empty page when the caller has no visible rivalries', async () => {
    mockRivalries.listByStatus.mockResolvedValue({ items: [], nextCursor: undefined });
    const res = await getRivalryActivity(makeEvent({ httpMethod: 'GET' }), ctx, cb);
    expect(res!.statusCode).toBe(200);
    const body = JSON.parse(res!.body);
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it('merges items from all sources and sorts them descending by occurredAt', async () => {
    mockRivalries.listByStatus.mockResolvedValue({
      items: [makeRivalry()],
      nextCursor: undefined,
    });
    // Each source contributes one item at a distinct timestamp.
    mockMessages.list.mockResolvedValue({
      items: [
        {
          rivalryId: 'r1',
          messageId: 'msg1',
          authorPlayerId: 'p1',
          body: 'trash talk',
          audience: 'all',
          createdAt: '2026-05-02T00:00:00.000Z',
        },
      ],
      nextCursor: undefined,
    });
    mockNotes.listByRivalry.mockResolvedValue([
      {
        rivalryId: 'r1',
        noteId: 'note1',
        noteType: 'storyline',
        visibility: 'all',
        body: 'beat 1',
        authorPlayerId: 'p1',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ]);
    mockMatches.list.mockResolvedValue([
      {
        matchId: 'm1',
        date: '2026-05-04T00:00:00.000Z',
        participants: ['p1', 'p2'],
        winners: ['p1'],
        status: 'completed',
      },
    ]);
    mockPromos.listByPlayer.mockImplementation(async (playerId: string) => {
      if (playerId !== 'p1') return [];
      return [
        {
          promoId: 'promo1',
          playerId: 'p1',
          content: 'I am the best',
          createdAt: '2026-05-03T00:00:00.000Z',
        },
      ];
    });

    const res = await getRivalryActivity(makeEvent({ httpMethod: 'GET' }), ctx, cb);
    expect(res!.statusCode).toBe(200);
    const body = JSON.parse(res!.body);
    expect(body.items.map((it: { kind: string }) => it.kind)).toEqual([
      'match',
      'promo',
      'message',
      'note',
    ]);
  });

  it('hides admins-only messages from a non-participant anonymous caller', async () => {
    mockRivalries.listByStatus.mockResolvedValue({
      items: [makeRivalry()],
      nextCursor: undefined,
    });
    mockMessages.list.mockResolvedValue({
      items: [
        {
          rivalryId: 'r1',
          messageId: 'msg-admins',
          authorPlayerId: 'p2',
          body: 'booker note in-thread',
          audience: 'admins',
          createdAt: '2026-05-05T00:00:00.000Z',
        },
        {
          rivalryId: 'r1',
          messageId: 'msg-all',
          authorPlayerId: 'p1',
          body: 'public taunt',
          audience: 'all',
          createdAt: '2026-05-06T00:00:00.000Z',
        },
      ],
      nextCursor: undefined,
    });

    const res = await getRivalryActivity(makeEvent({ httpMethod: 'GET' }), ctx, cb);
    const body = JSON.parse(res!.body);
    const messages = body.items.filter((it: { kind: string }) => it.kind === 'message');
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe('msg-all');
  });

  it('hides an admins-only message authored by the opposing wrestler when the caller is a participant', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1' });
    mockRivalries.listByParticipant.mockResolvedValue({
      items: [makeRivalry()],
      nextCursor: undefined,
    });
    mockMessages.list.mockResolvedValue({
      items: [
        {
          rivalryId: 'r1',
          messageId: 'msg-admins-from-p2',
          authorPlayerId: 'p2',
          body: 'gm-only',
          audience: 'admins',
          createdAt: '2026-05-07T00:00:00.000Z',
        },
        {
          rivalryId: 'r1',
          messageId: 'msg-participants',
          authorPlayerId: 'p2',
          body: 'just between us',
          audience: 'participants',
          createdAt: '2026-05-08T00:00:00.000Z',
        },
      ],
      nextCursor: undefined,
    });

    const res = await getRivalryActivity(
      withAuth(makeEvent({ httpMethod: 'GET', headers: { Authorization: 'Bearer test' } }), 'Wrestler'),
      ctx,
      cb,
    );
    const body = JSON.parse(res!.body);
    const ids = body.items
      .filter((it: { kind: string }) => it.kind === 'message')
      .map((it: { messageId: string }) => it.messageId);
    expect(ids).toContain('msg-participants');
    expect(ids).not.toContain('msg-admins-from-p2');
  });

  it('returns the next page with no overlap and no gap when called with the returned cursor', async () => {
    mockRivalries.listByStatus.mockResolvedValue({
      items: [makeRivalry()],
      nextCursor: undefined,
    });
    // Three messages on the same rivalry, distinct timestamps.
    const messages = [
      {
        rivalryId: 'r1',
        messageId: 'msg-newest',
        authorPlayerId: 'p1',
        body: 'a',
        audience: 'all',
        createdAt: '2026-05-10T00:00:00.000Z',
      },
      {
        rivalryId: 'r1',
        messageId: 'msg-middle',
        authorPlayerId: 'p1',
        body: 'b',
        audience: 'all',
        createdAt: '2026-05-09T00:00:00.000Z',
      },
      {
        rivalryId: 'r1',
        messageId: 'msg-oldest',
        authorPlayerId: 'p1',
        body: 'c',
        audience: 'all',
        createdAt: '2026-05-08T00:00:00.000Z',
      },
    ];
    mockMessages.list.mockResolvedValue({ items: messages, nextCursor: undefined });

    const page1Res = await getRivalryActivity(
      makeEvent({ httpMethod: 'GET', queryStringParameters: { limit: '2' } }),
      ctx,
      cb,
    );
    const page1 = JSON.parse(page1Res!.body);
    expect(page1.items.map((it: { messageId: string }) => it.messageId)).toEqual([
      'msg-newest',
      'msg-middle',
    ]);
    expect(page1.nextCursor).toBe('2026-05-09T00:00:00.000Z');

    _resetMemoForTesting();
    const page2Res = await getRivalryActivity(
      makeEvent({
        httpMethod: 'GET',
        queryStringParameters: { limit: '2', cursor: page1.nextCursor },
      }),
      ctx,
      cb,
    );
    const page2 = JSON.parse(page2Res!.body);
    expect(page2.items.map((it: { messageId: string }) => it.messageId)).toEqual([
      'msg-oldest',
    ]);
    expect(page2.nextCursor).toBeNull();
  });

  it('serves a memoized response for repeat hits within the 30s TTL', async () => {
    mockRivalries.listByStatus.mockResolvedValue({
      items: [makeRivalry()],
      nextCursor: undefined,
    });
    await getRivalryActivity(makeEvent({ httpMethod: 'GET' }), ctx, cb);
    await getRivalryActivity(makeEvent({ httpMethod: 'GET' }), ctx, cb);
    // listByStatus should only have run once because the second call
    // was served from the in-memory cache.
    expect(mockRivalries.listByStatus).toHaveBeenCalledTimes(1);
  });
});
