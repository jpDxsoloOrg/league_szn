import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from './testHelpers';

const mockRivalries = {
  get: vi.fn(),
  delete: vi.fn(),
};

const mockRivalryMessages = {
  list: vi.fn(),
};

const mockRivalryNotes = {
  listByRivalry: vi.fn(),
};

const mockRunInTransaction = vi.fn();

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    rivalryMessages: mockRivalryMessages,
    rivalryNotes: mockRivalryNotes,
    runInTransaction: mockRunInTransaction,
  }),
}));

import { handler as deleteRivalry } from '../deleteRivalry';

function adminEvent(rivalryId = 'r1') {
  return withAuth(
    makeEvent({ pathParameters: { rivalryId }, httpMethod: 'DELETE' }),
    'Admin',
  );
}

interface StagedOp {
  type: 'deleteRivalry' | 'deleteRivalryMessage' | 'deleteRivalryNote';
  args: unknown[];
}

describe('deleteRivalry', () => {
  let staged: StagedOp[];

  beforeEach(() => {
    vi.clearAllMocks();
    staged = [];
    mockRivalries.get.mockResolvedValue({
      rivalryId: 'r1',
      status: 'completed',
      participants: [
        { playerId: 'p1', role: 'instigator', addedAt: '' },
        { playerId: 'p2', role: 'rival', addedAt: '' },
      ],
    });
    mockRivalryMessages.list.mockResolvedValue({ items: [], nextCursor: undefined });
    mockRivalryNotes.listByRivalry.mockResolvedValue([]);
    mockRunInTransaction.mockImplementation(
      async (fn: (tx: Record<string, (...args: unknown[]) => void>) => Promise<unknown>) => {
        const tx = {
          deleteRivalry: (...args: unknown[]) => staged.push({ type: 'deleteRivalry', args }),
          deleteRivalryMessage: (...args: unknown[]) =>
            staged.push({ type: 'deleteRivalryMessage', args }),
          deleteRivalryNote: (...args: unknown[]) =>
            staged.push({ type: 'deleteRivalryNote', args }),
        };
        await fn(tx);
      },
    );
  });

  it('rejects callers without Admin/Moderator role', async () => {
    const event = withAuth(makeEvent({ pathParameters: { rivalryId: 'r1' } }), 'Wrestler');
    const res = await deleteRivalry(event, ctx, cb);
    expect(res!.statusCode).toBe(403);
  });

  it('returns 404 when the rivalry does not exist', async () => {
    mockRivalries.get.mockResolvedValueOnce(undefined);
    const res = await deleteRivalry(adminEvent(), ctx, cb);
    expect(res!.statusCode).toBe(404);
  });

  it('deletes a rivalry with no children and returns 204', async () => {
    const res = await deleteRivalry(adminEvent(), ctx, cb);
    expect(res!.statusCode).toBe(204);
    // 1 deleteRivalry op (which internally fans out META + participants
    // inside the UoW) and zero per-message / per-note ops.
    expect(staged.filter((s) => s.type === 'deleteRivalry')).toHaveLength(1);
    expect(staged.filter((s) => s.type === 'deleteRivalryMessage')).toHaveLength(0);
    expect(staged.filter((s) => s.type === 'deleteRivalryNote')).toHaveLength(0);
  });

  it('paginates messages and stages a delete per row when total exceeds one page', async () => {
    // 250 messages spread across two pages (200 + 50) — exercises the
    // cascade requirement from the ticket (>100 items per batch).
    const pageOne = Array.from({ length: 200 }, (_, i) => ({
      rivalryId: 'r1',
      messageId: `m${i}`,
      authorPlayerId: 'system',
      body: '...',
      audience: 'all' as const,
      createdAt: `2026-05-01T00:${String(i).padStart(2, '0')}:00.000Z`,
    }));
    const pageTwo = Array.from({ length: 50 }, (_, i) => ({
      rivalryId: 'r1',
      messageId: `m${200 + i}`,
      authorPlayerId: 'system',
      body: '...',
      audience: 'all' as const,
      createdAt: `2026-05-02T00:${String(i).padStart(2, '0')}:00.000Z`,
    }));
    mockRivalryMessages.list
      .mockResolvedValueOnce({ items: pageOne, nextCursor: 'next' })
      .mockResolvedValueOnce({ items: pageTwo, nextCursor: undefined });

    const res = await deleteRivalry(adminEvent(), ctx, cb);

    expect(res!.statusCode).toBe(204);
    expect(mockRivalryMessages.list).toHaveBeenCalledTimes(2);
    const messageDeletes = staged.filter((s) => s.type === 'deleteRivalryMessage');
    expect(messageDeletes).toHaveLength(250);
    // The single deleteRivalry op covers META + participant rows.
    expect(staged.filter((s) => s.type === 'deleteRivalry')).toHaveLength(1);
  });

  it('stages note deletes alongside message deletes', async () => {
    mockRivalryNotes.listByRivalry.mockResolvedValue([
      { rivalryId: 'r1', noteId: 'n1', noteType: 'storyline', visibility: 'admins', body: '', authorPlayerId: 'admin', createdAt: '', updatedAt: '' },
      { rivalryId: 'r1', noteId: 'n2', noteType: 'plan', visibility: 'admins', body: '', authorPlayerId: 'admin', createdAt: '', updatedAt: '' },
    ]);
    const res = await deleteRivalry(adminEvent(), ctx, cb);
    expect(res!.statusCode).toBe(204);
    expect(staged.filter((s) => s.type === 'deleteRivalryNote')).toHaveLength(2);
  });
});
