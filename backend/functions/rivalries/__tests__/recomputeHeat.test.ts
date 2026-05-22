import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from './testHelpers';

// ---- Repository Mocks -----------------------------------------------------

const mockRivalries = {
  get: vi.fn(),
};

const mockMatchesRepo = {
  findByRivalryId: vi.fn(),
};

const mockRunInTransaction = vi.fn();

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    competition: { matches: mockMatchesRepo },
    runInTransaction: mockRunInTransaction,
  }),
}));

import { handler as recomputeHeat } from '../recomputeHeat';

interface TxRecord {
  updateRivalry: ReturnType<typeof vi.fn>;
}

function adminEvent(rivalryId = 'r1') {
  return withAuth(
    makeEvent({ pathParameters: { rivalryId }, httpMethod: 'POST' }),
    'Admin',
  );
}

describe('POST /rivalry-requests/{rivalryId}/recompute-heat', () => {
  let tx: TxRecord;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.IS_OFFLINE;
    tx = { updateRivalry: vi.fn() };
    mockRunInTransaction.mockImplementation(
      async (fn: (tx: TxRecord) => Promise<unknown>) => {
        await fn(tx);
        return tx;
      },
    );
  });

  it('rejects non-Admin/Moderator callers with 403', async () => {
    const event = withAuth(
      makeEvent({ pathParameters: { rivalryId: 'r1' }, httpMethod: 'POST' }),
      'Wrestler',
    );
    const res = await recomputeHeat(event, ctx, cb);
    expect(res!.statusCode).toBe(403);
    expect(mockRivalries.get).not.toHaveBeenCalled();
  });

  it('returns 404 when the rivalry does not exist', async () => {
    mockRivalries.get.mockResolvedValueOnce(undefined);
    const res = await recomputeHeat(adminEvent('missing'), ctx, cb);
    expect(res!.statusCode).toBe(404);
    expect(mockMatchesRepo.findByRivalryId).not.toHaveBeenCalled();
  });

  it('returns 400 when rivalryId is missing', async () => {
    const event = withAuth(makeEvent({ httpMethod: 'POST' }), 'Admin');
    const res = await recomputeHeat(event, ctx, cb);
    expect(res!.statusCode).toBe(400);
  });

  it('recomputes heat from persisted match aggregates and stages the rivalry update', async () => {
    mockRivalries.get.mockResolvedValueOnce({
      rivalryId: 'r1',
      status: 'active',
      participants: [],
    });
    // Three high-rating matches with full weight → score in 'hot'+ band.
    mockMatchesRepo.findByRivalryId.mockResolvedValueOnce([
      { matchId: 'm1', ratingAverage: 4.5, ratingsCount: 5 },
      { matchId: 'm2', ratingAverage: 5, ratingsCount: 5 },
      { matchId: 'm3', ratingAverage: 4, ratingsCount: 5 },
    ]);

    const res = await recomputeHeat(adminEvent('r1'), ctx, cb);

    expect(res!.statusCode).toBe(200);
    const body = JSON.parse(res!.body);
    expect(body.rivalryId).toBe('r1');
    expect(body.ratedMatchCount).toBe(3);
    expect(body.heatScore).toBeGreaterThan(0);
    expect(['hot', 'scorching']).toContain(body.heat);

    expect(tx.updateRivalry).toHaveBeenCalledWith('r1', {
      heatScore: body.heatScore,
      heat: body.heat,
    });
  });
});
