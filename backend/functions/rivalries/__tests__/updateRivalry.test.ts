import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from './testHelpers';

const mockRivalries = {
  get: vi.fn(),
  update: vi.fn(),
};
const mockPlayers = {
  findByUserId: vi.fn(),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    roster: { players: mockPlayers },
  }),
}));

import { handler as updateRivalry } from '../updateRivalry';

const pending = {
  rivalryId: 'r1',
  status: 'pending',
  requestedBy: 'p1',
  participants: [],
  heat: 'warm',
};

function event(body: object, role: string, sub = 'user-1') {
  return withAuth(
    makeEvent({
      pathParameters: { rivalryId: 'r1' },
      body: JSON.stringify(body),
      httpMethod: 'PUT',
    }),
    role,
    sub,
  );
}

describe('updateRivalry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRivalries.get.mockResolvedValue(pending);
    mockRivalries.update.mockImplementation(async (id: string, patch: Record<string, unknown>) =>
      ({ ...pending, ...patch, rivalryId: id }),
    );
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-1' });
  });

  it('rejects callers without Wrestler or Admin', async () => {
    const res = await updateRivalry(event({ status: 'cancelled' }, 'Fantasy'), ctx, cb);
    expect(res!.statusCode).toBe(403);
  });

  it('lets an Admin patch the title', async () => {
    const res = await updateRivalry(event({ title: 'New title' }, 'Admin'), ctx, cb);
    expect(res!.statusCode).toBe(200);
    expect(mockRivalries.update).toHaveBeenCalledWith('r1', { title: 'New title' });
  });

  it('rejects an Admin who tries to flip status to active here', async () => {
    const res = await updateRivalry(event({ status: 'active' }, 'Admin'), ctx, cb);
    expect(res!.statusCode).toBe(400);
    expect(JSON.parse(res!.body).message).toMatch(/respond/i);
  });

  it('lets the original requester cancel a pending rivalry', async () => {
    const res = await updateRivalry(event({ status: 'cancelled' }, 'Wrestler'), ctx, cb);
    expect(res!.statusCode).toBe(200);
    expect(mockRivalries.update).toHaveBeenCalledWith('r1', { status: 'cancelled' });
  });

  it("blocks a wrestler from editing someone else's pending rivalry", async () => {
    mockPlayers.findByUserId.mockResolvedValueOnce({ playerId: 'other', userId: 'user-1' });
    const res = await updateRivalry(event({ status: 'cancelled' }, 'Wrestler'), ctx, cb);
    expect(res!.statusCode).toBe(403);
  });

  it('blocks a wrestler from editing free-form fields', async () => {
    const res = await updateRivalry(event({ title: 'sneaky' }, 'Wrestler'), ctx, cb);
    expect(res!.statusCode).toBe(403);
  });

  it('rejects cancelling a non-pending rivalry as a wrestler', async () => {
    mockRivalries.get.mockResolvedValueOnce({ ...pending, status: 'active' });
    const res = await updateRivalry(event({ status: 'cancelled' }, 'Wrestler'), ctx, cb);
    expect(res!.statusCode).toBe(400);
  });
});
