import { describe, expect, it } from 'vitest';
import {
  assembleTickerSegments,
  buildChampionsSegment,
  buildCustomSegments,
  buildHotRivalriesSegment,
  buildLatestResultsSegment,
  buildNewChampionsSegment,
  buildNewsSegment,
  buildPotentialCallupsSegment,
  buildPromotionWatchSegment,
  buildTonightSegment,
  buildUpcomingShowsSegment,
  describeMatchResult,
  TICKER_PRIORITY,
  type TickerEventInput,
} from '../segments';

const NOW = new Date('2026-11-16T18:00:00.000Z');

function event(overrides: Partial<TickerEventInput>): TickerEventInput {
  return { eventId: 'e1', name: 'Raw', eventType: 'weekly', date: '2026-11-16', status: 'upcoming', ...overrides };
}

describe('buildPotentialCallupsSegment', () => {
  it('lists each player linked to their profile', () => {
    const built = buildPotentialCallupsSegment([
      { playerId: 'p1', displayName: 'Cena' },
      { playerId: 'p2', displayName: 'Rock' },
    ]);
    expect(built).toEqual({
      key: 'potentialCallups',
      labelKey: 'ticker.segments.potentialCallups',
      priority: TICKER_PRIORITY.potentialCallups,
      items: [{ text: 'Cena', href: '/player/p1' }, { text: 'Rock', href: '/player/p2' }],
    });
  });

  it('returns null with no players', () => {
    expect(buildPotentialCallupsSegment([])).toBeNull();
  });
});

describe('buildPromotionWatchSegment', () => {
  it('uses its own key', () => {
    expect(buildPromotionWatchSegment([{ playerId: 'p1', displayName: 'Cena' }])?.key).toBe('promotionWatch');
    expect(buildPromotionWatchSegment([])).toBeNull();
  });
});

describe('buildNewChampionsSegment', () => {
  it('keeps changes from the last 7 days, newest first', () => {
    const built = buildNewChampionsSegment([
      { championshipId: 'c1', championshipName: 'World', championName: 'Old', wonDate: '2026-11-01T00:00:00.000Z' },
      { championshipId: 'c2', championshipName: 'IC', championName: 'Mid', wonDate: '2026-11-12T00:00:00.000Z' },
      { championshipId: 'c3', championshipName: 'Tag', championName: 'A & B', wonDate: '2026-11-15T00:00:00.000Z' },
    ], NOW);
    expect(built?.items.map((item) => item.text)).toEqual(['A & B · Tag', 'Mid · IC']);
    expect(built?.items[0]).toMatchObject({ href: '/championships', textParams: { champion: 'A & B', championship: 'Tag' } });
  });

  it('returns null when nothing changed recently', () => {
    expect(buildNewChampionsSegment([
      { championshipId: 'c1', championshipName: 'World', championName: 'Old', wonDate: '2026-10-01T00:00:00.000Z' },
    ], NOW)).toBeNull();
  });
});

describe('buildTonightSegment', () => {
  it('lists live and today shows, then the next PPV countdown', () => {
    const built = buildTonightSegment([
      event({ eventId: 'today', name: 'Raw', date: '2026-11-16' }),
      event({ eventId: 'live', name: 'SmackDown', status: 'in-progress', date: '2026-11-15' }),
      event({ eventId: 'ppv-far', name: 'Royal Rumble', eventType: 'ppv', date: '2026-12-20' }),
      event({ eventId: 'ppv', name: 'Survivor Series', eventType: 'ppv', date: '2026-11-19' }),
      event({ eventId: 'later', name: 'NXT', date: '2026-11-18' }),
    ], NOW);
    expect(built?.items).toEqual([
      { text: 'SmackDown', href: '/events/live' },
      { text: 'Raw', href: '/events/today' },
      {
        text: 'Next PPV in 3 days: Survivor Series',
        textKey: 'ticker.nextPpvText',
        textParams: { count: 3, name: 'Survivor Series' },
        href: '/events/ppv',
      },
    ]);
  });

  it('says "1 day" for tomorrow', () => {
    const built = buildTonightSegment([event({ eventType: 'ppv', date: '2026-11-17' })], NOW);
    expect(built?.items[0].text).toBe('Next PPV in 1 day: Raw');
  });

  it('returns null with no show today and no PPV ahead', () => {
    expect(buildTonightSegment([event({ date: '2026-11-18' })], NOW)).toBeNull();
  });
});

describe('buildUpcomingShowsSegment', () => {
  it('lists up to three shows after today, soonest first', () => {
    const built = buildUpcomingShowsSegment([
      event({ eventId: 'today', date: '2026-11-16' }),
      event({ eventId: 'd', date: '2026-11-25' }),
      event({ eventId: 'a', date: '2026-11-17' }),
      event({ eventId: 'c', date: '2026-11-21' }),
      event({ eventId: 'b', date: '2026-11-19T00:00:00.000Z' }),
    ], NOW);
    expect(built?.items.map((item) => item.href)).toEqual(['/events/a', '/events/b', '/events/c']);
    expect(built?.items[1].text).toBe('Raw · 2026-11-19');
  });

  it('returns null with nothing ahead', () => {
    expect(buildUpcomingShowsSegment([], NOW)).toBeNull();
  });
});

describe('buildHotRivalriesSegment', () => {
  it('keeps hot and scorching rivalries, scorching first', () => {
    const built = buildHotRivalriesSegment([
      { rivalryId: 'r1', title: 'Warm one', heat: 'warm' },
      { rivalryId: 'r2', title: 'Hot one', heat: 'hot' },
      { rivalryId: 'r3', title: 'Blazing', heat: 'scorching' },
    ]);
    expect(built?.items).toEqual([
      { text: 'Blazing', href: '/rivalries/r3' },
      { text: 'Hot one', href: '/rivalries/r2' },
    ]);
  });

  it('returns null with nothing hot', () => {
    expect(buildHotRivalriesSegment([{ rivalryId: 'r1', title: 'Cold', heat: 'cold' }])).toBeNull();
  });
});

describe('buildCustomSegments', () => {
  it('splits pinned messages into a leading segment', () => {
    const built = buildCustomSegments([
      { text: 'Draft night Friday', pinned: false },
      { text: 'Server maintenance', href: '/news/1', pinned: true },
    ]);
    expect(built.map((segment) => [segment.key, segment.priority])).toEqual([
      ['pinned', TICKER_PRIORITY.pinned],
      ['custom', TICKER_PRIORITY.custom],
    ]);
    expect(built[0].items).toEqual([{ text: 'Server maintenance', href: '/news/1' }]);
    expect(built[1].items).toEqual([{ text: 'Draft night Friday' }]);
  });

  it('returns nothing with no messages', () => {
    expect(buildCustomSegments([])).toEqual([]);
  });
});

describe('buildNewsSegment', () => {
  it('shows the first three articles', () => {
    const built = buildNewsSegment(['1', '2', '3', '4'].map((id) => ({ announcementId: id, title: `News ${id}` })));
    expect(built?.items).toHaveLength(3);
    expect(built?.items[0]).toEqual({ text: 'News 1', href: '/news/1' });
    expect(buildNewsSegment([])).toBeNull();
  });
});

describe('buildChampionsSegment', () => {
  it('lists each champion with their title', () => {
    expect(buildChampionsSegment([{ championName: 'Cena', championshipName: 'World' }])?.items)
      .toEqual([{ text: 'Cena · World', href: '/championships' }]);
    expect(buildChampionsSegment([])).toBeNull();
  });
});

describe('buildLatestResultsSegment', () => {
  it('names the show once, then results in card order', () => {
    const built = buildLatestResultsSegment({
      eventId: 'e9',
      name: 'WrestleMania',
      results: [{ position: 2, text: 'B def. C' }, { position: 1, text: 'A def. D' }],
    });
    expect(built?.items.map((item) => item.text)).toEqual(['WrestleMania', 'A def. D', 'B def. C']);
    expect(built?.items.every((item) => item.href === '/events/e9/results')).toBe(true);
  });

  it('returns null for no show or a show with no results', () => {
    expect(buildLatestResultsSegment(null)).toBeNull();
    expect(buildLatestResultsSegment({ eventId: 'e', name: 'X', results: [] })).toBeNull();
  });
});

describe('describeMatchResult', () => {
  const names: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' };
  const nameOf = (id: string) => names[id];

  it('describes a win', () => {
    expect(describeMatchResult({ status: 'completed', participants: ['a', 'b', 'c'], winners: ['a'], losers: ['b', 'c'] }, nameOf))
      .toBe('A def. B & C');
  });

  it('describes a draw by its sides', () => {
    expect(describeMatchResult({
      status: 'completed', participants: ['a', 'b', 'c', 'd'], teams: [['a', 'b'], ['c', 'd']],
      winners: ['a', 'b', 'c', 'd'], losers: [], isDraw: true,
    }, nameOf)).toBe('A & B vs C & D (draw)');
  });

  it('returns null for an unfinished match', () => {
    expect(describeMatchResult({ status: 'scheduled', participants: ['a', 'b'] }, nameOf)).toBeNull();
  });
});

describe('assembleTickerSegments', () => {
  it('drops empty segments and orders by priority', () => {
    const response = assembleTickerSegments([
      buildNewsSegment([{ announcementId: '1', title: 'News' }]),
      null,
      buildPotentialCallupsSegment([{ playerId: 'p1', displayName: 'Cena' }]),
      ...buildCustomSegments([{ text: 'Pinned', pinned: true }]),
    ], NOW);
    expect(response.segments.map((segment) => segment.key)).toEqual(['pinned', 'potentialCallups', 'news']);
    expect(response.generatedAt).toBe(NOW.toISOString());
  });

  it('returns no segments for no data', () => {
    expect(assembleTickerSegments([], NOW)).toEqual({ segments: [], generatedAt: NOW.toISOString() });
  });
});
