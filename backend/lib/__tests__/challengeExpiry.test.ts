import { describe, it, expect } from 'vitest';
import { CHALLENGE_EXPIRY_DAYS, challengeExpiresAt, isChallengeExpired } from '../challengeExpiry';

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED = Date.parse('2026-06-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

describe('challengeExpiresAt', () => {
  it('is CHALLENGE_EXPIRY_DAYS after the given time', () => {
    expect(CHALLENGE_EXPIRY_DAYS).toBe(4);
    expect(challengeExpiresAt(new Date(CREATED))).toBe(iso(CREATED + 4 * DAY_MS));
  });
});

describe('isChallengeExpired', () => {
  const current = { createdAt: iso(CREATED), expiresAt: iso(CREATED + 4 * DAY_MS) };

  it('is false before the deadline and true from the deadline on', () => {
    expect(isChallengeExpired(current, CREATED + 4 * DAY_MS - 1)).toBe(false);
    expect(isChallengeExpired(current, CREATED + 4 * DAY_MS)).toBe(true);
  });

  it('caps a row written with a seven day expiresAt at four days', () => {
    const legacy = { createdAt: iso(CREATED), expiresAt: iso(CREATED + 7 * DAY_MS) };
    expect(isChallengeExpired(legacy, CREATED + 3 * DAY_MS)).toBe(false);
    expect(isChallengeExpired(legacy, CREATED + 5 * DAY_MS)).toBe(true);
  });

  it('honours an expiresAt earlier than four days', () => {
    const short = { createdAt: iso(CREATED), expiresAt: iso(CREATED + DAY_MS) };
    expect(isChallengeExpired(short, CREATED + 2 * DAY_MS)).toBe(true);
  });

  it('falls back to createdAt when expiresAt is unreadable', () => {
    const noExpiry = { createdAt: iso(CREATED), expiresAt: '' };
    expect(isChallengeExpired(noExpiry, CREATED + DAY_MS)).toBe(false);
    expect(isChallengeExpired(noExpiry, CREATED + 5 * DAY_MS)).toBe(true);
  });

  it('never expires a row with no readable dates', () => {
    expect(isChallengeExpired({ createdAt: '', expiresAt: '' }, CREATED)).toBe(false);
  });
});
