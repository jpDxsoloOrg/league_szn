import { describe, it, expect } from 'vitest';
import {
  CONTRACT_STATUSES,
  afterMatch,
  canTransition,
  isFreeAgent,
  isOfferExpired,
  isTerminalStatus,
  validateOffer,
  type ContractOfferContext,
  type ContractOfferInput,
  type ContractOfferErrorCode,
} from '../contracts';
import type { Contract, ContractStatus } from '../../repositories/types';

const VALID_TRANSITIONS: Array<[ContractStatus, ContractStatus]> = [
  ['offered', 'active'],
  ['offered', 'declined'],
  ['offered', 'withdrawn'],
  ['offered', 'expired'],
  ['active', 'completed'],
  ['active', 'released'],
];

const isValidPair = (from: ContractStatus, to: ContractStatus): boolean =>
  VALID_TRANSITIONS.some(([validFrom, validTo]) => validFrom === from && validTo === to);

const ALL_PAIRS: Array<[ContractStatus, ContractStatus]> = CONTRACT_STATUSES.flatMap((from) =>
  CONTRACT_STATUSES.map((to): [ContractStatus, ContractStatus] => [from, to]));

describe('canTransition', () => {
  it.each(VALID_TRANSITIONS)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  const invalidPairs = ALL_PAIRS.filter(([from, to]) => !isValidPair(from, to));

  it('covers all 49 status pairs', () => {
    expect(invalidPairs.length + VALID_TRANSITIONS.length).toBe(49);
  });

  it.each(invalidPairs)('refuses %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('treats only offered and active as non-terminal', () => {
    expect(CONTRACT_STATUSES.filter((status) => !isTerminalStatus(status))).toEqual(['offered', 'active']);
  });
});

describe('validateOffer', () => {
  const settings = { offerExpiryDays: 3 };
  const now = new Date('2026-11-24T12:00:00.000Z');
  const context = { activeSeasonId: 'season-1', now };

  const tryout: ContractOfferInput = {
    playerId: 'p1', type: 'tryout', matchesTotal: 3, perMatchPay: 100, weeklySalary: 0, winBonus: 50,
  };
  const matches: ContractOfferInput = {
    playerId: 'p1', type: 'matches', matchesTotal: 10, perMatchPay: 0, weeklySalary: 500, winBonus: 0,
  };
  const season: ContractOfferInput = {
    playerId: 'p1', type: 'season', seasonId: 'season-1', perMatchPay: 200, weeklySalary: 300, winBonus: 100,
  };

  const errorCodes = (input: ContractOfferInput, ctx: ContractOfferContext = context): ContractOfferErrorCode[] => {
    const result = validateOffer(input, settings, ctx);
    return result.ok ? [] : result.errors.map((error) => error.code);
  };

  it('accepts a valid offer of each type', () => {
    expect(errorCodes(tryout)).toEqual([]);
    expect(errorCodes(matches)).toEqual([]);
    expect(errorCodes(season)).toEqual([]);
  });

  it('stamps offeredAt and an expiry offerExpiryDays later', () => {
    const result = validateOffer(tryout, settings, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offer.offeredAt).toBe('2026-11-24T12:00:00.000Z');
    expect(result.offer.offerExpiresAt).toBe('2026-11-27T12:00:00.000Z');
    expect(result.offer.matchesTotal).toBe(3);
    expect(result.offer.seasonId).toBeUndefined();
  });

  it('keeps seasonId and drops matchesTotal on a season offer', () => {
    const result = validateOffer(season, settings, context);
    expect(result.ok && result.offer.seasonId).toBe('season-1');
    expect(result.ok && 'matchesTotal' in result.offer).toBe(false);
  });

  describe('tryout', () => {
    it('needs matchesTotal of at least 1', () => {
      expect(errorCodes({ ...tryout, matchesTotal: undefined })).toEqual(['matchesTotalRequired']);
      expect(errorCodes({ ...tryout, matchesTotal: 0 })).toEqual(['matchesTotalRequired']);
      expect(errorCodes({ ...tryout, matchesTotal: 1.5 })).toEqual(['matchesTotalRequired']);
    });

    it('is per-match only', () => {
      expect(errorCodes({ ...tryout, weeklySalary: 100 })).toEqual(['tryoutSalaryNotAllowed']);
      expect(errorCodes({ ...tryout, perMatchPay: 0 })).toEqual(['noPay']);
    });

    it('may not name a season', () => {
      expect(errorCodes({ ...tryout, seasonId: 'season-1' })).toEqual(['seasonNotAllowed']);
    });
  });

  describe('matches', () => {
    it('needs matchesTotal of at least 1', () => {
      expect(errorCodes({ ...matches, matchesTotal: undefined })).toEqual(['matchesTotalRequired']);
      expect(errorCodes({ ...matches, matchesTotal: -2 })).toEqual(['matchesTotalRequired']);
    });

    it('needs per-match pay or a weekly salary', () => {
      expect(errorCodes({ ...matches, perMatchPay: 0, weeklySalary: 0 })).toEqual(['noPay']);
      expect(errorCodes({ ...matches, perMatchPay: 50, weeklySalary: 0 })).toEqual([]);
    });

    it('may not name a season', () => {
      expect(errorCodes({ ...matches, seasonId: 'season-1' })).toEqual(['seasonNotAllowed']);
    });
  });

  describe('season', () => {
    it('needs a seasonId', () => {
      expect(errorCodes({ ...season, seasonId: undefined })).toEqual(['seasonRequired']);
    });

    it('needs the active season', () => {
      expect(errorCodes({ ...season, seasonId: 'season-0' })).toEqual(['seasonNotActive']);
      expect(errorCodes(season, { now })).toEqual(['seasonNotActive']);
    });

    it('has no match count', () => {
      expect(errorCodes({ ...season, matchesTotal: 5 })).toEqual(['matchesTotalNotAllowed']);
    });

    it('needs per-match pay or a weekly salary', () => {
      expect(errorCodes({ ...season, perMatchPay: 0, weeklySalary: 0 })).toEqual(['noPay']);
      expect(errorCodes({ ...season, perMatchPay: 0, weeklySalary: 1 })).toEqual([]);
    });
  });

  it('rejects negative or fractional amounts', () => {
    expect(errorCodes({ ...matches, perMatchPay: -1 })).toEqual(['invalidAmount']);
    expect(errorCodes({ ...matches, weeklySalary: 10.5 })).toEqual(['invalidAmount']);
    expect(errorCodes({ ...matches, winBonus: -5 })).toEqual(['invalidAmount']);
  });

  it('rejects an unknown type and a missing player', () => {
    expect(errorCodes({ ...matches, type: 'lifetime' as ContractOfferInput['type'] })).toEqual(['invalidType']);
    expect(errorCodes({ ...matches, playerId: '' })).toEqual(['missingPlayer']);
  });

  it('rejects a broken offerExpiryDays setting', () => {
    const result = validateOffer(matches, { offerExpiryDays: 0 }, context);
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual(['invalidExpiry']);
  });
});

describe('afterMatch', () => {
  const activeTryout: Pick<Contract, 'type' | 'status' | 'matchesPlayed' | 'matchesTotal'> = {
    type: 'tryout', status: 'active', matchesPlayed: 0, matchesTotal: 3,
  };

  it('completes a tryout after its N matches', () => {
    let contract = { ...activeTryout };
    const results = [];
    for (let match = 0; match < 3; match++) {
      const result = afterMatch(contract);
      results.push(result);
      contract = { ...contract, matchesPlayed: result.matchesPlayed };
    }
    expect(results).toEqual([
      { matchesPlayed: 1, completed: false },
      { matchesPlayed: 2, completed: false },
      { matchesPlayed: 3, completed: true },
    ]);
  });

  it('completes a matches contract on its last match', () => {
    expect(afterMatch({ type: 'matches', status: 'active', matchesPlayed: 9, matchesTotal: 10 }))
      .toEqual({ matchesPlayed: 10, completed: true });
  });

  it('never completes a season contract by match count', () => {
    expect(afterMatch({ type: 'season', status: 'active', matchesPlayed: 99 }))
      .toEqual({ matchesPlayed: 100, completed: false });
  });

  it('refuses a contract that is not active', () => {
    expect(() => afterMatch({ ...activeTryout, status: 'offered' })).toThrow(/not active/);
  });
});

describe('isOfferExpired', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');

  it('is true for an open offer past its expiry', () => {
    expect(isOfferExpired({ status: 'offered', offerExpiresAt: '2026-11-24T11:59:59.000Z' }, now)).toBe(true);
  });

  it('is false before the expiry or once the offer is no longer open', () => {
    expect(isOfferExpired({ status: 'offered', offerExpiresAt: '2026-11-25T00:00:00.000Z' }, now)).toBe(false);
    expect(isOfferExpired({ status: 'active', offerExpiresAt: '2026-11-01T00:00:00.000Z' }, now)).toBe(false);
  });
});

describe('isFreeAgent', () => {
  it('is true without an active contract', () => {
    expect(isFreeAgent({})).toBe(true);
    expect(isFreeAgent({ activeContractId: '' })).toBe(true);
  });

  it('is false with an active contract', () => {
    expect(isFreeAgent({ activeContractId: 'c1' })).toBe(false);
  });
});
