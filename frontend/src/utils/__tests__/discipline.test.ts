import { describe, expect, it } from 'vitest';
import type { PlayerDisciplineSummary } from '../../types';
import { ApiError } from '../../services/api/apiClient';
import { formatCountdown, isBlockedNow, liveDiscipline, msUntilNextBoundary, refusalOr } from '../discipline';

const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const blocked: PlayerDisciplineSummary = {
  status: 'signup-blocked',
  activeStrikeCount: 2,
  activeStrikes: [
    { strikeId: 's1', issuedAt: at(-3 * DAY), reason: 'One' },
    { strikeId: 's2', issuedAt: at(-DAY), reason: 'Two' },
  ],
  cooldownEndsAt: at(13 * DAY),
  signupBlockedUntil: at(6 * DAY),
  deactivatedAt: null,
};

describe('isBlockedNow', () => {
  it('is false with nothing to read', () => {
    expect(isBlockedNow(undefined, NOW)).toBe(false);
    expect(isBlockedNow(null, NOW)).toBe(false);
  });

  it('is true up to the end and false on it, which counts as passed', () => {
    const until = Date.parse(blocked.signupBlockedUntil as string);
    expect(isBlockedNow(blocked, until - 1)).toBe(true);
    expect(isBlockedNow(blocked, until)).toBe(false);
  });
});

describe('liveDiscipline', () => {
  it('moves a block to cooldown once it ends, with the strikes still shown', () => {
    const live = liveDiscipline(blocked, NOW + 6 * DAY);
    expect(live?.status).toBe('cooldown');
    expect(live?.signupBlockedUntil).toBeNull();
    expect(live?.activeStrikes).toHaveLength(2);
  });

  it('clears everything once the cooldown ends', () => {
    expect(liveDiscipline(blocked, NOW + 13 * DAY)).toMatchObject({
      status: 'clear',
      activeStrikes: [],
      cooldownEndsAt: null,
    });
  });

  it('never ends a deactivation by date', () => {
    const deactivated: PlayerDisciplineSummary = {
      ...blocked,
      status: 'deactivated',
      cooldownEndsAt: null,
      signupBlockedUntil: null,
      deactivatedAt: at(-DAY),
    };
    expect(liveDiscipline(deactivated, NOW + 400 * DAY)).toBe(deactivated);
  });
});

describe('msUntilNextBoundary', () => {
  it('picks the nearer window', () => {
    expect(msUntilNextBoundary(blocked, NOW)).toBe(6 * DAY);
  });

  it('skips a window that has ended', () => {
    expect(msUntilNextBoundary(blocked, NOW + 7 * DAY)).toBe(6 * DAY);
  });

  it('is null when nothing is running', () => {
    expect(msUntilNextBoundary(blocked, NOW + 14 * DAY)).toBeNull();
    expect(msUntilNextBoundary(undefined, NOW)).toBeNull();
  });
});

describe('formatCountdown', () => {
  const t = (key: string, { count }: { count: number }) => `${count} ${key.split('.').pop()}`;

  it('shows days and hours', () => {
    expect(formatCountdown(5 * DAY + 3 * HOUR, t)).toBe('5 days 3 hours');
  });

  it('shows hours and minutes in the last day', () => {
    expect(formatCountdown(3 * HOUR + 12 * 60_000, t)).toBe('3 hours 12 minutes');
  });

  it('shows minutes and seconds in the last hour', () => {
    expect(formatCountdown(12 * 60_000 + 5000, t)).toBe('12 minutes 5 seconds');
  });

  it('rounds up, so it reads zero only at the end', () => {
    expect(formatCountdown(1, t)).toBe('0 minutes 1 seconds');
    expect(formatCountdown(-5000, t)).toBe('0 minutes 0 seconds');
  });
});

describe('refusalOr', () => {
  it('keeps a coded refusal and replaces anything else', () => {
    expect(refusalOr(new ApiError('Translated', 403, { code: 'SIGNUP_BLOCKED' }), 'Generic')).toBe('Translated');
    expect(refusalOr(new ApiError('Raw', 500), 'Generic')).toBe('Generic');
    expect(refusalOr(new Error('Raw'), 'Generic')).toBe('Generic');
  });
});
