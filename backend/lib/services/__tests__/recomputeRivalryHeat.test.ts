import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Repository Mocks -----------------------------------------------------

const mockMatchesRepo = {
  findByRivalryId: vi.fn(),
};

const mockRunInTransaction = vi.fn();

vi.mock('../../repositories', () => ({
  getRepositories: () => ({
    competition: { matches: mockMatchesRepo },
    runInTransaction: mockRunInTransaction,
  }),
}));

import { recomputeRivalryHeat } from '../recomputeRivalryHeat';
import type { UnitOfWork } from '../../repositories/unitOfWork';

// ---- Helpers --------------------------------------------------------------

interface TxRecord {
  updateRivalry: ReturnType<typeof vi.fn>;
}

function makeTxStub(): TxRecord & Partial<UnitOfWork> {
  return {
    updateRivalry: vi.fn(),
  };
}

function stubOwnTransaction(): { tx: TxRecord } {
  const tx: TxRecord = { updateRivalry: vi.fn() };
  mockRunInTransaction.mockImplementation(
    async (fn: (tx: TxRecord) => Promise<unknown>) => {
      await fn(tx);
      return tx;
    },
  );
  return { tx };
}

describe('recomputeRivalryHeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens its own transaction when no tx is supplied and stages the rivalry update', async () => {
    const { tx } = stubOwnTransaction();
    mockMatchesRepo.findByRivalryId.mockResolvedValueOnce([
      { matchId: 'm1', ratingAverage: 4.5, ratingsCount: 3 },
      { matchId: 'm2', ratingAverage: 5, ratingsCount: 2 },
    ]);

    const result = await recomputeRivalryHeat('riv-1');

    expect(mockRunInTransaction).toHaveBeenCalledTimes(1);
    expect(tx.updateRivalry).toHaveBeenCalledTimes(1);
    expect(tx.updateRivalry).toHaveBeenCalledWith('riv-1', {
      heatScore: result.heatScore,
      heat: result.heat,
    });
    expect(result.ratedMatchCount).toBe(2);
    // Above-pivot ratings → positive score → hot/scorching tier
    expect(result.heatScore).toBeGreaterThan(0);
  });

  it('stages the update on the supplied tx without opening a new transaction', async () => {
    const tx = makeTxStub();
    mockMatchesRepo.findByRivalryId.mockResolvedValueOnce([
      { matchId: 'm1', ratingAverage: 4, ratingsCount: 4 },
    ]);

    const result = await recomputeRivalryHeat('riv-2', tx as unknown as UnitOfWork);

    expect(mockRunInTransaction).not.toHaveBeenCalled();
    expect(tx.updateRivalry).toHaveBeenCalledTimes(1);
    expect(tx.updateRivalry).toHaveBeenCalledWith('riv-2', {
      heatScore: result.heatScore,
      heat: result.heat,
    });
    expect(result.ratedMatchCount).toBe(1);
  });

  it('treats matches with ratingsCount === 0 as no signal', async () => {
    const { tx } = stubOwnTransaction();
    mockMatchesRepo.findByRivalryId.mockResolvedValueOnce([
      { matchId: 'm1', ratingAverage: 0, ratingsCount: 0 },
      { matchId: 'm2', ratingAverage: 0, ratingsCount: 0 },
      // missing aggregate fields are also tolerated
      { matchId: 'm3' },
    ]);

    const result = await recomputeRivalryHeat('riv-3');

    expect(result.ratedMatchCount).toBe(0);
    expect(result.heatScore).toBe(0);
    expect(result.heat).toBe('warm');
    expect(tx.updateRivalry).toHaveBeenCalledWith('riv-3', {
      heatScore: 0,
      heat: 'warm',
    });
  });

  it('returns the neutral result when the rivalry has no matches', async () => {
    const { tx } = stubOwnTransaction();
    mockMatchesRepo.findByRivalryId.mockResolvedValueOnce([]);

    const result = await recomputeRivalryHeat('riv-empty');

    expect(result).toEqual({ heatScore: 0, heat: 'warm', ratedMatchCount: 0 });
    expect(tx.updateRivalry).toHaveBeenCalledWith('riv-empty', {
      heatScore: 0,
      heat: 'warm',
    });
  });
});
