import { describe, it, expect } from 'vitest';
import type { Show } from '../../types';
import { getPlannedShows } from '../showSchedule';

const show = (overrides: Partial<Show>): Show => ({
  showId: 's1',
  companyId: 'c1',
  name: 'Mayhem Monday',
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

// A Friday.
const today = new Date(2026, 10, 6);

describe('getPlannedShows', () => {
  it('finds the next date of a weekly show and sorts soonest first', () => {
    const planned = getPlannedShows([
      show({ showId: 'mon', schedule: 'weekly', dayOfWeek: 'monday' }),
      show({ showId: 'sat', schedule: 'weekly', dayOfWeek: 'saturday' }),
    ], [], today);

    expect(planned.map(({ show: { showId }, date }) => [showId, date])).toEqual([
      ['sat', '2026-11-07'],
      ['mon', '2026-11-09'],
    ]);
  });

  it('counts today, and moves past a date that already has an event', () => {
    const friday = show({ schedule: 'weekly', dayOfWeek: 'friday' });

    expect(getPlannedShows([friday], [], today)[0].date).toBe('2026-11-06');
    expect(getPlannedShows([friday], [{ showId: 's1', date: '2026-11-06T20:00:00.000Z' }], today)[0].date)
      .toBe('2026-11-13');
  });

  it('leaves out a past PPV, a booked PPV and a show with no schedule', () => {
    const planned = getPlannedShows([
      show({ showId: 'past', schedule: 'ppv', ppvDate: '2026-10-01' }),
      show({ showId: 'booked', schedule: 'ppv', ppvDate: '2026-12-01' }),
      show({ showId: 'special', schedule: 'special' }),
    ], [{ showId: 'booked', date: '2026-12-01' }], today);

    expect(planned).toEqual([]);
  });
});
