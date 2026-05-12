import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from './testHelpers';

const mockRivalries = {
  get: vi.fn(),
  listByParticipant: vi.fn(),
  listByStatus: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  addParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  delete: vi.fn(),
};

const mockPlayers = {
  findById: vi.fn(),
  findByUserId: vi.fn(),
};

const mockRunInTransaction = vi.fn();

const { mockCreateNotifications } = vi.hoisted(() => ({
  mockCreateNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    roster: { players: mockPlayers },
    runInTransaction: mockRunInTransaction,
  }),
}));

vi.mock('../../../lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotifications: mockCreateNotifications,
}));

vi.mock('uuid', () => ({ v4: () => 'msg-uuid-1' }));

import { handler as respondRivalry } from '../respondRivalry';

const pendingRivalry = {
  rivalryId: 'r1',
  title: 'feud',
  status: 'pending',
  heat: 'warm',
  participants: [
    { playerId: 'p1', role: 'instigator', addedAt: '' },
    { playerId: 'p2', role: 'rival', addedAt: '' },
  ],
  requestedBy: 'p1',
  createdAt: '',
  updatedAt: '',
};

function adminEvent(action: string, message?: string) {
  return withAuth(
    makeEvent({
      pathParameters: { rivalryId: 'r1' },
      body: JSON.stringify({ action, message }),
      httpMethod: 'POST',
    }),
    'Admin',
    'admin-sub',
    'gm-bob',
  );
}

describe('respondRivalry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRivalries.get.mockResolvedValue(pendingRivalry);
    mockPlayers.findById.mockImplementation(async (id: string) =>
      ({ playerId: id, userId: `user-${id}`, name: id }),
    );
    mockRunInTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        updateRivalry: vi.fn(),
        appendRivalryMessage: vi.fn(),
      };
      await fn(tx);
    });
  });

  it('rejects callers without Admin/Moderator role', async () => {
    const event = withAuth(
      makeEvent({
        pathParameters: { rivalryId: 'r1' },
        body: JSON.stringify({ action: 'approve' }),
      }),
      'Wrestler',
    );
    const res = await respondRivalry(event, ctx, cb);
    expect(res!.statusCode).toBe(403);
  });

  it('rejects unknown actions', async () => {
    const res = await respondRivalry(adminEvent('explode'), ctx, cb);
    expect(res!.statusCode).toBe(400);
    expect(JSON.parse(res!.body).message).toMatch(/action must be/i);
  });

  it('requires a message when rejecting', async () => {
    const res = await respondRivalry(adminEvent('reject'), ctx, cb);
    expect(res!.statusCode).toBe(400);
    expect(JSON.parse(res!.body).message).toMatch(/message is required/i);
  });

  it('approves a pending rivalry atomically', async () => {
    let staged: { type: string; args: unknown[] }[] = [];
    mockRunInTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      staged = [];
      const tx = {
        updateRivalry: (...args: unknown[]) => staged.push({ type: 'updateRivalry', args }),
        appendRivalryMessage: (...args: unknown[]) => staged.push({ type: 'appendRivalryMessage', args }),
      };
      await fn(tx);
    });
    mockRivalries.get
      .mockResolvedValueOnce(pendingRivalry) // initial load
      .mockResolvedValueOnce({ ...pendingRivalry, status: 'active' }); // post-commit reload

    const res = await respondRivalry(adminEvent('approve'), ctx, cb);

    expect(res!.statusCode).toBe(200);
    const body = JSON.parse(res!.body);
    expect(body.rivalry.status).toBe('active');
    expect(staged.map((s) => s.type)).toEqual(['updateRivalry', 'appendRivalryMessage']);
    const updateArgs = staged[0].args as [string, Record<string, unknown>];
    expect(updateArgs[0]).toBe('r1');
    expect(updateArgs[1].status).toBe('active');
    expect(updateArgs[1].startedAt).toBeDefined();
    expect(updateArgs[1].moderatedBy).toBe('gm-bob');
    expect(mockCreateNotifications).toHaveBeenCalledTimes(1);
    const params = mockCreateNotifications.mock.calls[0][0] as Array<{ type: string; userId: string }>;
    expect(params.map((p) => p.userId).sort()).toEqual(['user-p1', 'user-p2']);
    expect(params[0].type).toBe('rivalry_reviewed');
  });

  it('rejects approving a non-pending rivalry', async () => {
    mockRivalries.get.mockResolvedValueOnce({ ...pendingRivalry, status: 'active' });
    const res = await respondRivalry(adminEvent('approve'), ctx, cb);
    expect(res!.statusCode).toBe(400);
    expect(JSON.parse(res!.body).message).toMatch(/cannot approve/i);
  });

  it('concludes an active rivalry and sets endedAt', async () => {
    let updateCall: [string, Record<string, unknown>] | undefined;
    mockRunInTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        updateRivalry: (id: string, patch: Record<string, unknown>) => {
          updateCall = [id, patch];
        },
        appendRivalryMessage: vi.fn(),
      };
      await fn(tx);
    });
    mockRivalries.get
      .mockResolvedValueOnce({ ...pendingRivalry, status: 'active' })
      .mockResolvedValueOnce({ ...pendingRivalry, status: 'completed' });
    const res = await respondRivalry(adminEvent('conclude'), ctx, cb);
    expect(res!.statusCode).toBe(200);
    expect(updateCall![1].status).toBe('completed');
    expect(updateCall![1].endedAt).toBeDefined();
  });

  it('records moderationNote when rejecting', async () => {
    let updateCall: [string, Record<string, unknown>] | undefined;
    mockRunInTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        updateRivalry: (id: string, patch: Record<string, unknown>) => {
          updateCall = [id, patch];
        },
        appendRivalryMessage: vi.fn(),
      };
      await fn(tx);
    });
    mockRivalries.get
      .mockResolvedValueOnce(pendingRivalry)
      .mockResolvedValueOnce({ ...pendingRivalry, status: 'rejected' });
    const res = await respondRivalry(adminEvent('reject', 'too cluttered'), ctx, cb);
    expect(res!.statusCode).toBe(200);
    expect(updateCall![1].status).toBe('rejected');
    expect(updateCall![1].moderationNote).toBe('too cluttered');
  });
});
