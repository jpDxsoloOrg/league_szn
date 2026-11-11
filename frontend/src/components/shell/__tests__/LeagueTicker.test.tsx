import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { TFunction } from 'i18next';
import Ticker from '../../ui/Ticker';
import { buildTickerItems, describeResult } from '../tickerItems';
import type { LeaguePulse } from '../../../hooks/useLeaguePulse';
import type { Announcement } from '../../../types';
import type { EnrichedMatchData, EventWithMatches, LeagueEvent } from '../../../types/event';

const t = ((key: string) => key) as unknown as TFunction;

const UPCOMING = { eventId: 'e2', name: 'Mayhem Monday', date: '2026-11-09', status: 'upcoming' } as LeagueEvent;
const LIVE = { eventId: 'e1', name: 'Fallout Friday', date: '2026-11-06', status: 'in-progress' } as LeagueEvent;

function participant(playerId: string, wrestlerName: string) {
  return { playerId, playerName: playerId, wrestlerName };
}

function match(matchId: string, data: Partial<EnrichedMatchData>): EnrichedMatchData {
  return { matchId, matchFormat: 'singles', participants: [], isChampionship: false, status: 'completed', ...data } as EnrichedMatchData;
}

const WON = match('m1', { participants: [participant('p1', 'RoySzn'), participant('p2', 'Devlin')], winners: ['p1'], losers: ['p2'] });
const DRAWN = match('m2', { participants: [participant('p3', 'Ace'), participant('p4', 'Bolt')], winners: ['p3', 'p4'], losers: [] });
const TITLE = match('m3', {
  participants: [participant('p5', 'Lynx'), participant('p6', 'Kai'), participant('p7', 'Zed')],
  winners: ['p5'],
  losers: ['p6', 'p7'],
  isChampionship: true,
  championshipName: 'World Title',
});
const UNPLAYED = match('m4', { status: 'scheduled', participants: [participant('p1', 'RoySzn')] });

const SHOW = {
  eventId: 'e0',
  name: 'Warzone Wednesday',
  date: '2026-11-04',
  status: 'completed',
  enrichedMatches: [
    { position: 3, matchId: 'm3', designation: 'main-event', matchData: TITLE },
    { position: 1, matchId: 'm1', designation: 'opener', matchData: WON },
    { position: 2, matchId: 'm2', designation: 'midcard', matchData: DRAWN },
    { position: 4, matchId: 'm4', designation: 'midcard', matchData: UNPLAYED },
    { position: 5, matchId: 'gone', designation: 'midcard', matchData: null },
  ],
} as unknown as EventWithMatches;

const STORY: Announcement = {
  announcementId: 'a1', title: 'Strike system', body: '<p>Body</p>', isActive: true, priority: 3, createdAt: '2026-11-07', updatedAt: '2026-11-07',
};

const EMPTY: LeaguePulse = { dashboard: null, news: [], upcomingShows: [], recentShows: [] };

const OLDER_SHOW = {
  eventId: 'e-1',
  name: 'Mayhem Monday',
  date: '2026-11-02',
  status: 'completed',
  enrichedMatches: [{ position: 1, matchId: 'm9', designation: 'opener', matchData: { ...WON, matchId: 'm9' } }],
} as unknown as EventWithMatches;

const EMPTY_SHOW = { ...OLDER_SHOW, eventId: 'e-2', name: 'Fallout Friday', enrichedMatches: [] } as unknown as EventWithMatches;

describe('buildTickerItems', () => {
  it('runs upcoming shows, then news, then each show named once and followed by its results in card order', () => {
    const items = buildTickerItems({ ...EMPTY, news: [STORY], upcomingShows: [LIVE, UPCOMING], recentShows: [SHOW] }, t, 'en');
    expect(items.map((item) => item.id)).toEqual(['show-e1', 'show-e2', 'news-a1', 'results-e0', 'result-e0-m1', 'result-e0-m2', 'result-e0-m3']);
    expect(items[0]).toMatchObject({ tag: 'ticker.tags.live', text: 'Fallout Friday', to: '/events/e1' });
    expect(items[1]).toMatchObject({ tag: 'ticker.tags.upcoming', text: 'Mayhem Monday · Nov 9', to: '/events/e2' });
    expect(items[2]).toMatchObject({ tag: 'ticker.tags.news', text: 'Strike system', to: '/news/a1' });
    expect(items[3]).toMatchObject({ tag: 'ticker.tags.results', text: 'Warzone Wednesday · Nov 4', to: '/events/e0/results' });
    expect(items[4]).toEqual({ id: 'result-e0-m1', text: 'RoySzn dashboard.def Devlin', to: '/events/e0/results' });
    expect(items[5]).toMatchObject({ text: 'Ace vs Bolt (dashboard.draw)' });
    expect(items[5]).not.toHaveProperty('tag');
    expect(items[6]).toMatchObject({ tag: 'World Title', tagTone: 'prestige', text: 'Lynx dashboard.def Kai & Zed' });
  });

  it('tags news in gold and lists each champion with their belt before the results', () => {
    const dashboard = {
      currentChampions: [
        { championshipId: 'c1', championshipName: 'World Title', championName: 'Lynx', championshipImageUrl: 'https://img/belt.png', playerId: 'p5' },
        { championshipId: 'c2', championshipName: 'Tag Titles', championName: 'Ace & Bolt', playerId: 'p3' },
      ],
    } as unknown as LeaguePulse['dashboard'];
    const items = buildTickerItems({ ...EMPTY, dashboard, news: [STORY], recentShows: [SHOW] }, t, 'en');

    expect(items.map((item) => item.id).slice(0, 4)).toEqual(['news-a1', 'champion-c1', 'champion-c2', 'results-e0']);
    expect(items[0]).toMatchObject({ tag: 'ticker.tags.news', tagTone: 'prestige' });
    expect(items[1]).toEqual({
      id: 'champion-c1',
      tag: 'ticker.tags.champion',
      tagTone: 'prestige',
      text: 'Lynx · World Title',
      to: '/championships',
      iconUrl: 'https://img/belt.png',
    });
    expect(items[2]).not.toHaveProperty('iconUrl');
  });

  it('keeps the newest show first and names each show only once', () => {
    const items = buildTickerItems({ ...EMPTY, recentShows: [SHOW, EMPTY_SHOW, OLDER_SHOW] }, t, 'en');
    expect(items.map((item) => item.id)).toEqual(['results-e0', 'result-e0-m1', 'result-e0-m2', 'result-e0-m3', 'results-e-1', 'result-e-1-m9']);
    expect(items.filter((item) => item.tag === 'ticker.tags.results').map((item) => item.text)).toEqual([
      'Warzone Wednesday · Nov 4',
      'Mayhem Monday · Nov 2',
    ]);
  });

  it('has no headlines without data', () => {
    expect(buildTickerItems(EMPTY, t)).toEqual([]);
  });
});

describe('describeResult', () => {
  it('reports nothing for a match that has not been played', () => {
    expect(describeResult(UNPLAYED, t)).toBeNull();
  });
});

describe('Ticker', () => {
  const props = { label: 'Wire', ariaLabel: 'News ticker', pauseLabel: 'Pause', resumeLabel: 'Resume' };

  it('renders nothing with no headlines', () => {
    const { container } = render(<MemoryRouter><Ticker {...props} items={[]} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });

  it('reads each headline once though the crawl draws it twice, and can be paused', async () => {
    const { container } = render(
      <MemoryRouter>
        <Ticker {...props} items={[{ id: 'one', text: 'Big news', tag: 'News', to: '/news/one' }]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: 'News ticker' })).toBeInTheDocument();
    expect(container.querySelectorAll('.ui-ticker__list')).toHaveLength(2);
    const loopCopy = container.querySelector('.ui-ticker__list[aria-hidden="true"]');
    expect(loopCopy).not.toHaveAttribute('inert');
    expect(loopCopy?.querySelector('a')).toHaveAttribute('tabindex', '-1');
    expect(screen.getAllByRole('link', { name: 'News Big news' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(container.querySelector('.ui-ticker')).toHaveClass('ui-ticker--paused');
  });

  it.each([0, 1])('opens the headline when copy %i of the crawl is clicked, tag included', async (copy) => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Ticker {...props} items={[{ id: 'one', text: 'Big news', tag: 'News', to: '/news/one' }]} />} />
          <Route path="/news/:newsId" element={<p>Story page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const lists = container.querySelectorAll('.ui-ticker__list');
    await userEvent.click(lists[copy]!.querySelector('.ui-ticker__tag')!);
    expect(screen.getByText('Story page')).toBeInTheDocument();
  });

  it('draws an item icon as decoration beside the headline', () => {
    const { container } = render(
      <MemoryRouter>
        <Ticker {...props} items={[{ id: 'c1', text: 'Lynx · World Title', tag: 'Champion', to: '/championships', iconUrl: 'https://img/belt.png' }]} />
      </MemoryRouter>,
    );
    const icon = container.querySelector('.ui-ticker__list img');
    expect(icon).toHaveAttribute('src', 'https://img/belt.png');
    expect(icon).toHaveAttribute('alt', '');
    expect(screen.getByRole('link', { name: 'Champion Lynx · World Title' })).toHaveAttribute('href', '/championships');
  });

  it('leaves a headline with nowhere to go as plain text', () => {
    render(<MemoryRouter><Ticker {...props} items={[{ id: 'one', text: 'Just words', tag: 'Results' }]} /></MemoryRouter>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByText('Just words')).toHaveLength(2);
  });

  it('stops crawling for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(<MemoryRouter><Ticker {...props} items={[{ id: 'one', text: 'Big news' }]} /></MemoryRouter>);
    expect(container.querySelector('.ui-ticker')).toHaveClass('ui-ticker--static');
    expect(container.querySelectorAll('.ui-ticker__list')).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
