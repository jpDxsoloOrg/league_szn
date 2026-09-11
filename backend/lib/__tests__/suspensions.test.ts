import { describe, it, expect } from 'vitest';
import type { LeagueEvent, Player, PlayerSuspension } from '../repositories/types';
import {
  buildSuspensionRow,
  countShowsServed,
  isSuspensionServed,
  todayIsoDateUtc,
  validateSuspensionInput,
} from '../suspensions';

const TODAY = '2026-09-10';

function makeEvent(overrides: Partial<LeagueEvent> & Pick<LeagueEvent, 'date' | 'status'>): LeagueEvent {
  return {
    eventId: `evt-${overrides.date}-${overrides.status}`,
    name: 'Show',
    eventType: 'weekly',
    matchCards: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as LeagueEvent;
}

function makePlayer(suspension?: PlayerSuspension): Player {
  return {
    playerId: 'p1',
    name: 'JP',
    currentWrestler: 'Cody Rhodes',
    wins: 0,
    losses: 0,
    draws: 0,
    imageUrl: 'https://img/p1.png',
    divisionId: 'div-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(suspension ? { suspension } : {}),
  } as Player;
}

describe('todayIsoDateUtc', () => {
  it('returns the UTC calendar day', () => {
    expect(todayIsoDateUtc(new Date('2026-09-10T23:59:59.000Z'))).toBe('2026-09-10');
    expect(todayIsoDateUtc(new Date('2026-09-11T00:00:00.000Z'))).toBe('2026-09-11');
  });
});

describe('validateSuspensionInput', () => {
  it('accepts a future until date', () => {
    const result = validateSuspensionInput({ until: '2026-09-30' }, TODAY);
    expect(result).toEqual({ ok: true, value: { until: '2026-09-30' } });
  });

  it('accepts showsRequired within range', () => {
    const result = validateSuspensionInput({ showsRequired: 3 }, TODAY);
    expect(result).toEqual({ ok: true, value: { showsRequired: 3 } });
  });

  it('rejects when both until and showsRequired are set', () => {
    const result = validateSuspensionInput({ until: '2026-09-30', showsRequired: 3 }, TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not both/);
  });

  it('rejects when neither is set', () => {
    expect(validateSuspensionInput({}, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ reason: 'x' }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ until: '', showsRequired: null }, TODAY).ok).toBe(false);
  });

  it('rejects a non-object body', () => {
    expect(validateSuspensionInput(null, TODAY).ok).toBe(false);
    expect(validateSuspensionInput('until', TODAY).ok).toBe(false);
    expect(validateSuspensionInput([], TODAY).ok).toBe(false);
  });

  it('rejects malformed or impossible until dates', () => {
    expect(validateSuspensionInput({ until: 'tomorrow' }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ until: '2026-09-30T00:00:00Z' }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ until: '2026-02-30' }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ until: '2026-13-01' }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ until: 20260930 }, TODAY).ok).toBe(false);
  });

  it('rejects until dates that are today or in the past', () => {
    const past = validateSuspensionInput({ until: '2026-09-01' }, TODAY);
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.message).toMatch(/future/);
    expect(validateSuspensionInput({ until: TODAY }, TODAY).ok).toBe(false);
  });

  it('rejects showsRequired outside 1..52 or non-integer', () => {
    expect(validateSuspensionInput({ showsRequired: 0 }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ showsRequired: 53 }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ showsRequired: -1 }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ showsRequired: 2.5 }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ showsRequired: '3' }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ showsRequired: Number.NaN }, TODAY).ok).toBe(false);
    expect(validateSuspensionInput({ showsRequired: 1 }, TODAY).ok).toBe(true);
    expect(validateSuspensionInput({ showsRequired: 52 }, TODAY).ok).toBe(true);
  });

  it('trims the reason and drops it when blank', () => {
    const withReason = validateSuspensionInput({ showsRequired: 2, reason: '  no-show  ' }, TODAY);
    expect(withReason).toEqual({ ok: true, value: { showsRequired: 2, reason: 'no-show' } });

    const blank = validateSuspensionInput({ showsRequired: 2, reason: '   ' }, TODAY);
    expect(blank).toEqual({ ok: true, value: { showsRequired: 2 } });
  });

  it('rejects a reason longer than 500 characters or not a string', () => {
    const tooLong = validateSuspensionInput({ showsRequired: 2, reason: 'a'.repeat(501) }, TODAY);
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.message).toMatch(/500/);

    const exact = validateSuspensionInput({ showsRequired: 2, reason: 'a'.repeat(500) }, TODAY);
    expect(exact.ok).toBe(true);

    expect(validateSuspensionInput({ showsRequired: 2, reason: 42 }, TODAY).ok).toBe(false);
  });
});

describe('countShowsServed', () => {
  const suspendedAt = '2026-09-01T18:00:00.000Z';

  it('counts only completed events dated after the suspension', () => {
    const events = [
      makeEvent({ date: '2026-09-05', status: 'completed' }),
      makeEvent({ date: '2026-09-12', status: 'completed' }),
      makeEvent({ date: '2026-09-19', status: 'upcoming' }),
      makeEvent({ date: '2026-09-08', status: 'cancelled' }),
      makeEvent({ date: '2026-09-09', status: 'in-progress' }),
    ];
    expect(countShowsServed(events, suspendedAt)).toBe(2);
  });

  it('excludes completed events dated before the suspension', () => {
    const events = [
      makeEvent({ date: '2026-08-25', status: 'completed' }),
      makeEvent({ date: '2026-08-31', status: 'completed' }),
      makeEvent({ date: '2026-09-03', status: 'completed' }),
    ];
    expect(countShowsServed(events, suspendedAt)).toBe(1);
  });

  it('anchors bare dates at UTC noon when comparing with an ISO suspendedAt', () => {
    // Suspended at 09:00Z on the 1st: a show on the 1st (noon anchor) counts.
    expect(countShowsServed([makeEvent({ date: '2026-09-01', status: 'completed' })], '2026-09-01T09:00:00.000Z')).toBe(1);
    // Suspended at 15:00Z on the 1st: the same show (noon anchor) does not.
    expect(countShowsServed([makeEvent({ date: '2026-09-01', status: 'completed' })], '2026-09-01T15:00:00.000Z')).toBe(0);
  });

  it('handles ISO event dates and bare suspendedAt', () => {
    const events = [
      makeEvent({ date: '2026-09-01T11:00:00.000Z', status: 'completed' }),
      makeEvent({ date: '2026-09-01T13:00:00.000Z', status: 'completed' }),
      makeEvent({ date: '2026-09-02T00:00:00.000Z', status: 'completed' }),
    ];
    // Bare suspendedAt anchors at noon on the 1st.
    expect(countShowsServed(events, '2026-09-01')).toBe(2);
  });

  it('ignores unparseable dates and returns 0 for an invalid suspendedAt', () => {
    const events = [
      makeEvent({ date: 'garbage', status: 'completed' }),
      makeEvent({ date: '2026-09-05', status: 'completed' }),
    ];
    expect(countShowsServed(events, suspendedAt)).toBe(1);
    expect(countShowsServed(events, 'not-a-date')).toBe(0);
    expect(countShowsServed([], suspendedAt)).toBe(0);
  });
});

describe('isSuspensionServed', () => {
  const base: PlayerSuspension = { suspendedAt: '2026-09-01T00:00:00.000Z' };

  it('is served by date when until is today or earlier', () => {
    expect(isSuspensionServed({ ...base, until: '2026-09-10' }, 0, TODAY)).toEqual({ served: true, reason: 'date' });
    expect(isSuspensionServed({ ...base, until: '2026-09-01' }, 0, TODAY)).toEqual({ served: true, reason: 'date' });
  });

  it('is not served when until is in the future', () => {
    expect(isSuspensionServed({ ...base, until: '2026-09-11' }, 99, TODAY)).toEqual({ served: false, reason: null });
  });

  it('is served by shows when enough shows have been completed', () => {
    expect(isSuspensionServed({ ...base, showsRequired: 3 }, 3, TODAY)).toEqual({ served: true, reason: 'shows' });
    expect(isSuspensionServed({ ...base, showsRequired: 3 }, 5, TODAY)).toEqual({ served: true, reason: 'shows' });
  });

  it('is not served when shows remain', () => {
    expect(isSuspensionServed({ ...base, showsRequired: 3 }, 2, TODAY)).toEqual({ served: false, reason: null });
  });

  it('is never served when neither condition is set', () => {
    expect(isSuspensionServed(base, 100, TODAY)).toEqual({ served: false, reason: null });
  });
});

describe('buildSuspensionRow', () => {
  const events = [
    makeEvent({ date: '2026-09-03', status: 'completed' }),
    makeEvent({ date: '2026-09-06', status: 'completed' }),
    makeEvent({ date: '2026-09-13', status: 'upcoming' }),
  ];

  it('returns null for a player without a suspension', () => {
    expect(buildSuspensionRow(makePlayer(), events, TODAY)).toBeNull();
  });

  it('computes remaining shows for a show-based suspension', () => {
    const suspension: PlayerSuspension = {
      suspendedAt: '2026-09-01T00:00:00.000Z',
      suspendedBy: 'admin',
      reason: 'no-show',
      showsRequired: 4,
    };
    const row = buildSuspensionRow(makePlayer(suspension), events, TODAY);
    expect(row).toEqual({
      playerId: 'p1',
      name: 'JP',
      currentWrestler: 'Cody Rhodes',
      imageUrl: 'https://img/p1.png',
      divisionId: 'div-1',
      suspension,
      showsServed: 2,
      showsRemaining: 2,
      eligibleForReinstatement: false,
      eligibleReason: null,
    });
  });

  it('flags a show-based suspension as eligible once served, clamping remaining at 0', () => {
    const suspension: PlayerSuspension = { suspendedAt: '2026-09-01T00:00:00.000Z', showsRequired: 1 };
    const row = buildSuspensionRow(makePlayer(suspension), events, TODAY);
    expect(row?.showsServed).toBe(2);
    expect(row?.showsRemaining).toBe(0);
    expect(row?.eligibleForReinstatement).toBe(true);
    expect(row?.eligibleReason).toBe('shows');
  });

  it('reports null remaining shows and date eligibility for a date-based suspension', () => {
    const pending = buildSuspensionRow(
      makePlayer({ suspendedAt: '2026-09-01T00:00:00.000Z', until: '2026-09-30' }),
      events,
      TODAY,
    );
    expect(pending?.showsServed).toBe(2);
    expect(pending?.showsRemaining).toBeNull();
    expect(pending?.eligibleForReinstatement).toBe(false);
    expect(pending?.eligibleReason).toBe(null);

    const passed = buildSuspensionRow(
      makePlayer({ suspendedAt: '2026-09-01T00:00:00.000Z', until: '2026-09-10' }),
      events,
      TODAY,
    );
    expect(passed?.eligibleForReinstatement).toBe(true);
    expect(passed?.eligibleReason).toBe('date');
  });
});
