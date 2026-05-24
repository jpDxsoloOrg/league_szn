import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Repository Mocks -----------------------------------------------------

const mockMatchesRepo = {
  findByRivalryId: vi.fn(),
};

const mockPromosRepo = {
  listByRivalry: vi.fn(),
};

const mockSiteConfigRepo = {
  getHeatTunables: vi.fn(),
};

const mockRunInTransaction = vi.fn();

vi.mock('../../repositories', () => ({
  getRepositories: () => ({
    competition: { matches: mockMatchesRepo },
    content: { promos: mockPromosRepo },
    user: { siteConfig: mockSiteConfigRepo },
    runInTransaction: mockRunInTransaction,
  }),
}));

// Tunables default — matches DEFAULT_HEAT_TUNABLES on the backend.
const DEFAULT_TUNABLES = {
  pivot: 2.5,
  maxWeight: 5,
  scoreCap: 100,
  motnMultiplier: 1.5,
  promoBase: 3,
  promoReactionStep: 1.4,
  promoBonusCap: 7,
  promoMaxReactionCount: 5,
};

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
    // Default: no promos contribute, default tunables. Individual tests
    // can override these mocks before calling recomputeRivalryHeat.
    mockPromosRepo.listByRivalry.mockResolvedValue([]);
    mockSiteConfigRepo.getHeatTunables.mockResolvedValue(DEFAULT_TUNABLES);
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

    expect(result).toEqual({ heatScore: 0, heat: 'warm', ratedMatchCount: 0, promoCount: 0 });
    expect(tx.updateRivalry).toHaveBeenCalledWith('riv-empty', {
      heatScore: 0,
      heat: 'warm',
    });
  });

  it('folds in call-out + rivalry promos and reports promoCount', async () => {
    const { tx } = stubOwnTransaction();
    mockMatchesRepo.findByRivalryId.mockResolvedValueOnce([]);
    mockPromosRepo.listByRivalry.mockResolvedValueOnce([
      {
        promoId: 'p1',
        promoType: 'call-out',
        rivalryId: 'riv-p',
        reactionCounts: { fire: 2, trash: 0, mic: 0, 'mind-blown': 0, clap: 0 },
        isHidden: false,
      },
      {
        promoId: 'p2',
        promoType: 'rivalry',
        rivalryId: 'riv-p',
        reactionCounts: { fire: 0, trash: 1, mic: 0, 'mind-blown': 0, clap: 0 },
        isHidden: false,
      },
    ]);

    const result = await recomputeRivalryHeat('riv-p');

    expect(result.promoCount).toBe(2);
    // 2 promos × base(3) = 6; reactions: +(2*1.4) − (1*1.4) = +1.4
    expect(result.heatScore).toBeCloseTo(6 + 1.4);
    expect(tx.updateRivalry).toHaveBeenCalledWith('riv-p', {
      heatScore: result.heatScore,
      heat: result.heat,
    });
  });

  it('ignores non-contributing promo types', async () => {
    const { tx } = stubOwnTransaction();
    mockMatchesRepo.findByRivalryId.mockResolvedValueOnce([]);
    mockPromosRepo.listByRivalry.mockResolvedValueOnce([
      // 'open-mic' is tagged to a rivalry for context but doesn't move heat.
      {
        promoId: 'p-omn',
        promoType: 'open-mic',
        rivalryId: 'riv-x',
        reactionCounts: { fire: 5, trash: 0, mic: 0, 'mind-blown': 0, clap: 0 },
        isHidden: false,
      },
    ]);

    const result = await recomputeRivalryHeat('riv-x');

    expect(result.promoCount).toBe(0);
    expect(result.heatScore).toBe(0);
    expect(tx.updateRivalry).toHaveBeenCalledWith('riv-x', {
      heatScore: 0,
      heat: 'warm',
    });
  });

  it('skips hidden promos so admins can mute a viral promo from heat', async () => {
    const { tx } = stubOwnTransaction();
    mockMatchesRepo.findByRivalryId.mockResolvedValueOnce([]);
    mockPromosRepo.listByRivalry.mockResolvedValueOnce([
      {
        promoId: 'p-hidden',
        promoType: 'call-out',
        rivalryId: 'riv-h',
        reactionCounts: { fire: 5, trash: 0, mic: 0, 'mind-blown': 0, clap: 0 },
        isHidden: true,
      },
    ]);

    const result = await recomputeRivalryHeat('riv-h');

    expect(result.promoCount).toBe(0);
    expect(result.heatScore).toBe(0);
    expect(tx.updateRivalry).toHaveBeenCalled();
  });

  it('respects admin-overridden tunables (promoBase) from siteConfig', async () => {
    const { tx } = stubOwnTransaction();
    mockMatchesRepo.findByRivalryId.mockResolvedValueOnce([]);
    mockPromosRepo.listByRivalry.mockResolvedValueOnce([
      {
        promoId: 'p1',
        promoType: 'call-out',
        rivalryId: 'riv-t',
        reactionCounts: { fire: 0, trash: 0, mic: 0, 'mind-blown': 0, clap: 0 },
        isHidden: false,
      },
    ]);
    mockSiteConfigRepo.getHeatTunables.mockResolvedValueOnce({
      ...DEFAULT_TUNABLES,
      promoBase: 9,
    });

    const result = await recomputeRivalryHeat('riv-t');

    expect(result.heatScore).toBeCloseTo(9);
    expect(tx.updateRivalry).toHaveBeenCalledWith('riv-t', {
      heatScore: 9,
      heat: 'warm',
    });
  });
});
