import { describe, it, expect } from 'vitest';
import {
  bookingRefusal,
  callerRefusal,
  computeDiscipline,
  DEACTIVATION_WINDOW_START_DAYS,
  isDeactivated,
  isSignupBlocked,
  nextStrikeOutcome,
  targetRefusal,
  toSignupGuardKey,
  validateReason,
  type DisciplineFields,
  type DisciplineStatus,
} from '../discipline';
import type { PlayerStrike } from '../repositories/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.parse('2026-03-01T12:00:00.000Z');

const at = (day: number): Date => new Date(EPOCH + day * DAY_MS);
const iso = (day: number): string => at(day).toISOString();

function strike(day: number, clearedDay?: number): PlayerStrike {
  return {
    strikeId: `s${day}`,
    issuedAt: iso(day),
    issuedBy: 'admin-sub',
    issuedByName: 'Admin',
    reason: `Strike on day ${day}`,
    ...(clearedDay !== undefined ? { clearedAt: iso(clearedDay) } : {}),
  };
}

const strikes = (...days: number[]): DisciplineFields => ({ strikes: days.map((day) => strike(day)) });
const deactivated = (...days: number[]): DisciplineFields => ({
  ...strikes(...days),
  deactivatedAt: iso(days[days.length - 1]),
});
/** Keeps `days` active and clears `clearedDays` by reactivation at day `clearedAt`. */
const withCleared = (days: number[], clearedDays: number[], clearedAt: number): DisciplineFields => ({
  strikes: [...days.map((day) => strike(day)), ...clearedDays.map((day) => strike(day, clearedAt))],
});

interface Vector {
  label: string;
  player: DisciplineFields;
  now: number;
  status: DisciplineStatus;
  count: number;
  cooldownEnd?: number;
  blockEnd?: number;
}

const VECTORS: Vector[] = [
  { label: 'no strikes', player: {}, now: 0, status: 'clear', count: 0 },
  { label: 'warning still running', player: strikes(0), now: 6.9, status: 'warned', count: 1, cooldownEnd: 7 },
  { label: 'warning ends on the boundary', player: strikes(0), now: 7, status: 'clear', count: 0 },
  { label: 'second strike', player: strikes(0, 5), now: 5, status: 'signup-blocked', count: 2, cooldownEnd: 19, blockEnd: 12 },
  { label: 'block ends on the boundary', player: strikes(0, 5), now: 12, status: 'cooldown', count: 2, cooldownEnd: 19 },
  { label: 'cooldown ends on the boundary', player: strikes(0, 5), now: 19, status: 'clear', count: 0 },
  { label: 'first lapsed, fresh first strike', player: strikes(0, 8), now: 8, status: 'warned', count: 1, cooldownEnd: 15 },
  { label: 'fresh first strike on the boundary', player: strikes(0, 7), now: 7, status: 'warned', count: 1, cooldownEnd: 14 },
  { label: 'second strike just inside the warning', player: strikes(0, 6.999), now: 7, status: 'signup-blocked', count: 2, cooldownEnd: 20.999, blockEnd: 13.999 },
  { label: 'count resets after the cooldown', player: strikes(0, 5, 21), now: 21, status: 'warned', count: 1, cooldownEnd: 28 },
  { label: 'fresh first strike on the cooldown boundary', player: strikes(0, 5, 19), now: 19, status: 'warned', count: 1, cooldownEnd: 26 },
  { label: 'first strike removed', player: { strikes: [strike(0, 6), strike(5)] }, now: 6, status: 'warned', count: 1, cooldownEnd: 12 },
  { label: 'second strike removed', player: { strikes: [strike(0), strike(5, 6)] }, now: 6, status: 'warned', count: 1, cooldownEnd: 7 },
  { label: 'removal after the second strike\'s own warning lapsed', player: { strikes: [strike(0, 15), strike(5)] }, now: 15, status: 'clear', count: 0 },
  { label: 'third strike just before the block ends', player: deactivated(0, 5, 11.999), now: 12, status: 'deactivated', count: 3 },
  { label: 'third strike on the block boundary', player: deactivated(0, 5, 12), now: 12, status: 'deactivated', count: 3 },
  { label: 'third strike at the end of the cooldown', player: deactivated(0, 5, 18.999), now: 19, status: 'deactivated', count: 3 },
  { label: 'still deactivated far past every window', player: deactivated(0, 5, 13), now: 400, status: 'deactivated', count: 3 },
  { label: 'deactivated with an earlier lapsed strike', player: deactivated(0, 20, 22, 30), now: 31, status: 'deactivated', count: 3 },
  { label: 'reactivated, lapsed strike stays uncleared', player: withCleared([0], [20, 22, 30], 31), now: 31, status: 'clear', count: 0 },
  { label: 'strike after reactivation is a first strike', player: { strikes: [strike(0, 13.5), strike(5, 13.5), strike(13, 13.5), strike(14)] }, now: 14, status: 'warned', count: 1, cooldownEnd: 21 },
  { label: 'restore keeps the original dates', player: withCleared([0, 5], [13], 13.5), now: 13.5, status: 'cooldown', count: 2, cooldownEnd: 19 },
  { label: 'restored strikes end on their own dates', player: withCleared([0, 5], [13], 13.5), now: 19, status: 'clear', count: 0 },
];

describe('computeDiscipline', () => {
  it.each(VECTORS)('$label', ({ player, now, status, count, cooldownEnd, blockEnd }) => {
    const summary = computeDiscipline(player, at(now));

    expect(summary.status).toBe(status);
    expect(summary.activeStrikeCount).toBe(count);
    expect(summary.activeStrikes).toHaveLength(count);
    expect(summary.cooldownEndsAt).toBe(cooldownEnd === undefined ? null : iso(cooldownEnd));
    expect(summary.signupBlockedUntil).toBe(blockEnd === undefined ? null : iso(blockEnd));
    expect(summary.deactivatedAt).toBe(player.deactivatedAt ?? null);
  });

  it('gives the same answer for unsorted input', () => {
    const unsorted = { strikes: [strike(5), strike(0)] };

    expect(computeDiscipline(unsorted, at(6))).toEqual(computeDiscipline(strikes(0, 5), at(6)));
    expect(computeDiscipline(unsorted, at(6)).activeStrikes.map((view) => view.strikeId)).toEqual(['s0', 's5']);
  });

  it('does not reorder the caller\'s strikes', () => {
    const unsorted = { strikes: [strike(5), strike(0)] };

    computeDiscipline(unsorted, at(6));

    expect(unsorted.strikes.map((row) => row.strikeId)).toEqual(['s5', 's0']);
  });

  it('leaves the issuer out of the strikes it shows', () => {
    expect(computeDiscipline(strikes(0), at(1)).activeStrikes).toEqual([
      { strikeId: 's0', issuedAt: iso(0), reason: 'Strike on day 0' },
    ]);
  });

  it('never deactivates from the replay alone', () => {
    // Three strikes in a run can exist only if the window start was raised.
    const summary = computeDiscipline(strikes(0, 5, 11.999), at(12));

    expect(summary).toMatchObject({
      status: 'signup-blocked',
      activeStrikeCount: 3,
      signupBlockedUntil: iso(18.999),
      cooldownEndsAt: iso(25.999),
    });
  });
});

describe('nextStrikeOutcome', () => {
  it('treats a third strike anywhere in the 14 days as deactivating by default', () => {
    expect(DEACTIVATION_WINDOW_START_DAYS).toBe(0);
  });

  it.each([
    { label: 'no strikes', days: [], now: 0, expected: 'warned' },
    { label: 'one active', days: [0], now: 3, expected: 'signup-blocked' },
    { label: 'warning ended', days: [0], now: 7, expected: 'warned' },
    { label: 'the moment after strike 2', days: [0, 5], now: 5, expected: 'deactivated' },
    { label: 'first week of the 14 days', days: [0, 5], now: 8, expected: 'deactivated' },
    { label: 'T2 + 7d exactly', days: [0, 5], now: 12, expected: 'deactivated' },
    { label: 'the last millisecond', days: [0, 5], now: 19 - 1 / DAY_MS, expected: 'deactivated' },
    { label: 'cooldown ended', days: [0, 5], now: 19, expected: 'warned' },
  ])('$label gives $expected', ({ days, now, expected }) => {
    expect(nextStrikeOutcome(strikes(...days), at(now))).toBe(expected);
  });

  it.each([
    { days: [0, 5], now: 8, expected: 'signup-blocked' },
    { days: [0, 5], now: 12, expected: 'deactivated' },
    { days: [0, 5, 8], now: 14, expected: 'signup-blocked' },
    { days: [0, 5, 8], now: 15, expected: 'deactivated' },
  ])('with a raised window of 7, $days at $now gives $expected', ({ days, now, expected }) => {
    expect(nextStrikeOutcome(strikes(...days), at(now), 7)).toBe(expected);
  });
});

describe('isDeactivated and isSignupBlocked', () => {
  it('reads only the flag for deactivation', () => {
    expect(isDeactivated({ deactivatedAt: iso(0) })).toBe(true);
    expect(isDeactivated({})).toBe(false);
  });

  it.each([
    { label: 'clear', player: {}, now: 0, expected: false },
    { label: 'warned', player: strikes(0), now: 1, expected: false },
    { label: 'blocked', player: strikes(0, 5), now: 6, expected: true },
    { label: 'cooldown', player: strikes(0, 5), now: 12, expected: false },
    { label: 'deactivated', player: deactivated(0, 5, 13), now: 400, expected: true },
  ])('$label gives $expected', ({ player, now, expected }) => {
    expect(isSignupBlocked(player, at(now))).toBe(expected);
  });
});

describe('validateReason', () => {
  it('trims and accepts the minimum', () => {
    expect(validateReason('  abc  ')).toEqual({ reason: 'abc' });
  });

  it('accepts the maximum', () => {
    expect(validateReason('a'.repeat(500))).toEqual({ reason: 'a'.repeat(500) });
  });

  it.each([
    ['too short', 'ab'],
    ['too short once trimmed', '  ab  '],
    ['too long', 'a'.repeat(501)],
    ['missing', undefined],
    ['not a string', 42],
  ])('refuses a reason that is %s', (_label, raw) => {
    expect(validateReason(raw)).toHaveProperty('error');
  });
});

describe('toSignupGuardKey', () => {
  it.each([
    ['ignores case', 'Some.One@Example.COM', 'some.one@example.com'],
    ['drops a +tag', 'someone+league@example.com', 'someone@example.com'],
    ['keeps dots outside Gmail', 'some.one@example.com', 'some.one@example.com'],
    ['drops Gmail dots', 'so.me.one@gmail.com', 'someone@gmail.com'],
    ['drops Googlemail dots', 'so.me.one@googlemail.com', 'someone@googlemail.com'],
    ['handles tag and dots together', 'So.Me+x@Gmail.com', 'some@gmail.com'],
    ['trims', '  someone@example.com ', 'someone@example.com'],
    ['leaves a value with no domain', 'NotAnEmail', 'notanemail'],
    ['keeps a local part that starts with a plus', '+x@example.com', '+x@example.com'],
  ])('%s', (_label, email, expected) => {
    expect(toSignupGuardKey(email)).toBe(expected);
  });
});

describe('refusals', () => {
  const body = (result: { body: string } | null) => JSON.parse(result?.body ?? '{}') as Record<string, unknown>;

  describe('callerRefusal', () => {
    it('gives SIGNUP_BLOCKED with the end date', () => {
      const result = callerRefusal(strikes(0, 5), at(6));

      expect(result?.statusCode).toBe(403);
      expect(body(result)).toMatchObject({ code: 'SIGNUP_BLOCKED', blockedUntil: iso(12) });
    });

    it('gives PLAYER_DEACTIVATED with no end date', () => {
      const result = callerRefusal(deactivated(0, 5, 13), at(14));

      expect(result?.statusCode).toBe(403);
      expect(body(result).code).toBe('PLAYER_DEACTIVATED');
      expect(body(result)).not.toHaveProperty('blockedUntil');
    });

    it.each([
      ['clear', {}, 0],
      ['warned', strikes(0), 1],
      ['in cooldown', strikes(0, 5), 12],
    ])('passes a player who is %s', (_label, player, now) => {
      expect(callerRefusal(player, at(now))).toBeNull();
    });
  });

  describe('targetRefusal', () => {
    it.each([
      ['blocked', strikes(0, 5), 6],
      ['deactivated', deactivated(0, 5, 13), 14],
    ])('gives one neutral answer for a %s player', (_label, player, now) => {
      const result = targetRefusal(player, at(now));

      expect(result?.statusCode).toBe(409);
      expect(body(result)).toEqual({ code: 'PLAYER_UNAVAILABLE', message: 'That player is not available right now' });
    });

    it('passes a player in cooldown', () => {
      expect(targetRefusal(strikes(0, 5), at(12))).toBeNull();
    });
  });

  describe('bookingRefusal', () => {
    it('refuses a deactivated player by name', () => {
      const result = bookingRefusal({ ...deactivated(0, 5, 13), name: 'Rock' });

      expect(result?.statusCode).toBe(409);
      expect(body(result).code).toBe('PLAYER_DEACTIVATED');
      expect(body(result).message).toContain('Rock');
    });

    it('passes a sign-up block', () => {
      expect(bookingRefusal(strikes(0, 5))).toBeNull();
    });
  });
});
