import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import type { EconomySettings } from '../../../services/api/economy.api';
import { contractBadgeLabel, contractLengthLabel } from '../contractDisplay';
import {
  DEFAULT_MATCH_CONTRACT_LENGTH,
  findOfferProblem,
  matchesLeft,
  offerExpiryDate,
  offerFormFor,
  toOfferRequest,
} from '../offerForm';

const settings = {
  contractDefaults: {
    tryout: { matches: 3, perMatchPay: 100, weeklySalary: 0, winBonus: 50 },
    matches: { perMatchPay: 150, weeklySalary: 20, winBonus: 75 },
    season: { perMatchPay: 100, weeklySalary: 250, winBonus: 100 },
  },
  offerExpiryDays: 3,
} as EconomySettings;

const TYPE_NAMES: Record<string, string> = {
  'contracts.types.tryout': 'Tryout',
  'contracts.types.season': 'Season contract',
};

/** Fills `{{name}}` placeholders in the default value, like i18next does. */
const t = ((key: string, options?: string | Record<string, unknown>) => {
  if (TYPE_NAMES[key]) return TYPE_NAMES[key];
  if (typeof options === 'string') return options;
  const template = String(options?.defaultValue ?? key);
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ''));
}) as unknown as TFunction;

describe('offerFormFor', () => {
  it('prefills a tryout from its defaults with no weekly salary', () => {
    expect(offerFormFor('tryout', settings)).toEqual({
      type: 'tryout', matchesTotal: 3, perMatchPay: 100, weeklySalary: 0, winBonus: 50, note: '',
    });
  });

  it('prefills a season contract and keeps the note across a type change', () => {
    expect(offerFormFor('season', settings, 'Welcome')).toMatchObject({
      type: 'season', perMatchPay: 100, weeklySalary: 250, winBonus: 100, note: 'Welcome',
    });
  });

  it('starts a match contract at the default length', () => {
    expect(offerFormFor('matches', settings).matchesTotal).toBe(DEFAULT_MATCH_CONTRACT_LENGTH);
  });
});

describe('findOfferProblem', () => {
  it('accepts the defaults', () => {
    expect(findOfferProblem(offerFormFor('season', settings), 'season-1')).toBeNull();
    expect(findOfferProblem(offerFormFor('tryout', settings), undefined)).toBeNull();
  });

  it('rejects empty, negative or fractional amounts', () => {
    expect(findOfferProblem({ ...offerFormFor('matches', settings), winBonus: Number.NaN }, undefined)).toBe('amounts');
    expect(findOfferProblem({ ...offerFormFor('matches', settings), perMatchPay: -1 }, undefined)).toBe('amounts');
    expect(findOfferProblem({ ...offerFormFor('matches', settings), weeklySalary: 1.5 }, undefined)).toBe('amounts');
  });

  it('needs an active season for a season contract', () => {
    expect(findOfferProblem(offerFormFor('season', settings), undefined)).toBe('noActiveSeason');
  });

  it('needs at least one match for tryouts and match contracts', () => {
    expect(findOfferProblem({ ...offerFormFor('matches', settings), matchesTotal: 0 }, undefined)).toBe('matchesTotal');
  });

  it('needs some pay', () => {
    expect(findOfferProblem({ ...offerFormFor('matches', settings), perMatchPay: 0, weeklySalary: 0 }, undefined)).toBe('noPay');
  });

  it('keeps tryouts to per-match pay', () => {
    expect(findOfferProblem({ ...offerFormFor('tryout', settings), weeklySalary: 10 }, undefined)).toBe('tryoutPay');
    expect(findOfferProblem({ ...offerFormFor('tryout', settings), perMatchPay: 0 }, undefined)).toBe('tryoutPay');
  });
});

describe('toOfferRequest', () => {
  it('sends the season for a season contract and no match count', () => {
    expect(toOfferRequest('p1', offerFormFor('season', settings, '  Hi  '), 'season-1')).toEqual({
      playerId: 'p1', type: 'season', perMatchPay: 100, weeklySalary: 250, winBonus: 100, seasonId: 'season-1', note: 'Hi',
    });
  });

  it('sends the match count for a tryout and leaves out an empty note', () => {
    expect(toOfferRequest('p1', offerFormFor('tryout', settings), 'season-1')).toEqual({
      playerId: 'p1', type: 'tryout', perMatchPay: 100, weeklySalary: 0, winBonus: 50, matchesTotal: 3,
    });
  });
});

describe('offerExpiryDate', () => {
  it('adds the offer expiry days', () => {
    const now = new Date('2026-11-20T12:00:00.000Z');
    expect(offerExpiryDate(settings, now).toISOString()).toBe('2026-11-23T12:00:00.000Z');
  });
});

describe('contract wording', () => {
  const seasons = new Map([['s4', 'Season 4']]);

  it('counts matches left and never below zero', () => {
    expect(matchesLeft({ matchesTotal: 5, matchesPlayed: 2 })).toBe(3);
    expect(matchesLeft({ matchesTotal: 2, matchesPlayed: 3 })).toBe(0);
    expect(matchesLeft({ matchesPlayed: 3 })).toBeUndefined();
  });

  it('labels the length of each kind of contract', () => {
    expect(contractLengthLabel({ type: 'matches', matchesTotal: 5, matchesPlayed: 2 }, seasons, t)).toBe('3 of 5 matches left');
    expect(contractLengthLabel({ type: 'season', matchesPlayed: 0, seasonId: 's4' }, seasons, t)).toBe('Through Season 4');
  });

  it('builds the public badge without money', () => {
    expect(contractBadgeLabel(null, seasons, t)).toBe('Free agent');
    expect(contractBadgeLabel({ type: 'season', matchesPlayed: 0, seasonId: 's4' }, seasons, t))
      .toBe('Season contract, through Season 4');
    expect(contractBadgeLabel({ type: 'tryout', matchesTotal: 3, matchesPlayed: 1 }, seasons, t))
      .toBe('Tryout, 2 of 3 matches left');
  });
});
