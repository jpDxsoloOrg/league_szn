import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from '../../__tests__/testHelpers';

const mockRivalries = { get: vi.fn() };
const mockPlayers = { findById: vi.fn(), findByUserId: vi.fn() };
const mockRunInTransaction = vi.fn();

const { mockCreateRivalryNotification } = vi.hoisted(() => ({
  mockCreateRivalryNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    roster: { players: mockPlayers },
    runInTransaction: mockRunInTransaction,
  }),
}));

vi.mock('../../../../lib/notifications', () => ({
  createRivalryNotification: mockCreateRivalryNotification,
}));

vi.mock('uuid', () => ({ v4: () => 'msg-1' }));

import { handler as postMessage } from '../postMessage';

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

function postEvent(body: Record<string, unknown>) {
  return makeEvent({
    httpMethod: 'POST',
    pathParameters: { rivalryId: 'r1' },
    body: JSON.stringify(body),
  });
}

describe('postMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRivalries.get.mockResolvedValue(rivalry);
    mockPlayers.findByUserId.mockResolvedValue(null);
    mockPlayers.findById.mockImplementation(async (id: string) => ({
      playerId: id,
      userId: `user-${id}`,
      name: id,
    }));
    mockRunInTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      await fn({ appendRivalryMessage: vi.fn() });
    });
  });

  it('lets a participant post and notifies the other participant', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });

    const res = await postMessage(
      withAuth(postEvent({ content: 'come at me', audience: 'participants' }), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(200);
    expect(mockRunInTransaction).toHaveBeenCalledTimes(1);
    // One recipient (p2), one notification.
    expect(mockCreateRivalryNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateRivalryNotification).toHaveBeenCalledWith(
      'r1',
      'user-p2',
      'rivalry_message',
      expect.stringContaining('come at me'),
    );
  });

  it('rejects non-participants with 403 (not 404)', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p99', userId: 'user-other' });

    const res = await postMessage(
      withAuth(postEvent({ content: 'hi' }), 'Wrestler', 'user-other'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(403);
    expect(mockRunInTransaction).not.toHaveBeenCalled();
    expect(mockCreateRivalryNotification).not.toHaveBeenCalled();
  });

  it('lets a GM post even when they are not a rivalry participant', async () => {
    mockPlayers.findByUserId.mockResolvedValue(null);

    const res = await postMessage(
      withAuth(postEvent({ content: 'GM note', audience: 'admins' }), 'Admin', 'gm-sub'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(200);
    expect(mockRunInTransaction).toHaveBeenCalledTimes(1);
  });

  it('skips notification fan-out when audience is admins-only', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });

    await postMessage(
      withAuth(postEvent({ content: 'gm-only', audience: 'admins' }), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    // No participant notifications for admins-only audience.
    expect(mockCreateRivalryNotification).not.toHaveBeenCalled();
  });

  it('returns 400 when content is empty', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });

    const res = await postMessage(
      withAuth(postEvent({ content: '   ' }), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(400);
  });

  it('returns 404 when the rivalry does not exist', async () => {
    mockRivalries.get.mockResolvedValueOnce(undefined);
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });

    const res = await postMessage(
      withAuth(postEvent({ content: 'hi' }), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(404);
  });
});
