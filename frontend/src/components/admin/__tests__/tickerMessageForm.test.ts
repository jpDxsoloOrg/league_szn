import { describe, expect, it } from 'vitest';
import type { TickerMessage } from '../../../types';
import {
  buildBreakingNewsTickerMessage,
  clampTickerText,
  expireNowPatch,
  fromLocalInputValue,
  getTickerMessageStatus,
  toLocalInputValue,
} from '../tickerMessageForm';

const NOW = new Date('2026-11-16T12:00:00.000Z');

const message = (startsAt: string, expiresAt: string): TickerMessage => ({
  messageId: 'm1',
  text: 'Draft night!',
  pinned: false,
  startsAt,
  expiresAt,
  createdBy: 'gm',
  createdAt: startsAt,
  updatedAt: startsAt,
});

describe('getTickerMessageStatus', () => {
  it('reports scheduled, live and expired', () => {
    expect(getTickerMessageStatus(message('2026-11-17T00:00:00.000Z', '2026-11-18T00:00:00.000Z'), NOW)).toBe('scheduled');
    expect(getTickerMessageStatus(message('2026-11-15T00:00:00.000Z', '2026-11-18T00:00:00.000Z'), NOW)).toBe('live');
    expect(getTickerMessageStatus(message('2026-11-15T00:00:00.000Z', NOW.toISOString()), NOW)).toBe('expired');
  });
});

describe('expireNowPatch', () => {
  it('only moves the expiry for a live message', () => {
    expect(expireNowPatch(message('2026-11-15T00:00:00.000Z', '2026-11-18T00:00:00.000Z'), NOW))
      .toEqual({ expiresAt: NOW.toISOString() });
  });

  it('moves the start back for a scheduled message, so the end stays after it', () => {
    const patch = expireNowPatch(message('2026-11-17T00:00:00.000Z', '2026-11-18T00:00:00.000Z'), NOW);
    expect(patch.expiresAt).toBe(NOW.toISOString());
    expect(patch.startsAt! < patch.expiresAt!).toBe(true);
  });
});

describe('datetime-local conversion', () => {
  it('round-trips to the same minute', () => {
    const iso = '2026-11-16T12:34:00.000Z';
    expect(fromLocalInputValue(toLocalInputValue(iso))).toBe(iso);
  });
});

describe('breaking news ticker message', () => {
  it('clamps long headlines to 140 characters', () => {
    const clamped = clampTickerText('x'.repeat(200));
    expect(clamped).toHaveLength(140);
    expect(clamped.endsWith('…')).toBe(true);
    expect(clampTickerText('  Short  ')).toBe('Short');
  });

  it('links the story and uses the announcement expiry when it is in the future', () => {
    const input = buildBreakingNewsTickerMessage('Title change!', 'ann-1', '2026-11-20T00:00:00.000Z', NOW);
    expect(input).toEqual({
      text: 'Title change!',
      href: '/news/ann-1',
      startsAt: NOW.toISOString(),
      expiresAt: '2026-11-20T00:00:00.000Z',
    });
  });

  it('runs for a day when the announcement has no future expiry', () => {
    const input = buildBreakingNewsTickerMessage('Title change!', 'ann-1', undefined, NOW);
    expect(input.expiresAt).toBe('2026-11-17T12:00:00.000Z');
  });
});
