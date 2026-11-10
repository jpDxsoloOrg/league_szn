import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { TFunction } from 'i18next';
import Ticker from '../../ui/Ticker';
import { buildTickerItems } from '../tickerItems';
import type { LeaguePulse } from '../../../hooks/useLeaguePulse';
import type { Announcement, DashboardData } from '../../../types';

const t = ((key: string) => key) as unknown as TFunction;

const DASHBOARD: DashboardData = {
  currentChampions: [{ championshipId: 'c1', championshipName: 'World Title', championName: 'Lynx', playerId: 'p1' }],
  upcomingEvents: [{ eventId: 'e2', name: 'Mayhem Monday', date: '2026-11-09', eventType: 'weekly' }],
  inProgressEvents: [{ eventId: 'e1', name: 'Fallout Friday', date: '2026-11-06', eventType: 'weekly' }],
  recentResults: [
    { matchId: 'm1', date: '2026-11-04', matchType: 'singles', winnerName: 'RoySzn', loserName: 'Devlin', eventId: 'e0' },
    { matchId: 'm2', date: '2026-11-04', matchType: 'singles', winnerName: '', loserName: '', isDraw: true, participantsName: 'A vs B' },
    { matchId: 'm3', date: '2026-11-04', matchType: 'singles', winnerName: 'Lynx', loserName: 'Kai', isChampionship: true, championshipName: 'World Title' },
  ],
  seasonInfo: null,
  quickStats: { totalPlayers: 0, totalMatches: 0, activeChampionships: 0 },
  activeChallengesCount: 0,
};

const STORY: Announcement = {
  announcementId: 'a1', title: 'Strike system', body: '<p>Body</p>', isActive: true, priority: 3, createdAt: '2026-11-07', updatedAt: '2026-11-07',
};

describe('buildTickerItems', () => {
  it('leads with live and next shows, then news, results and champions', () => {
    const items = buildTickerItems({ dashboard: DASHBOARD, news: [STORY] }, t, 'en');
    expect(items.map((item) => item.id)).toEqual(['live-e1', 'next-e2', 'news-a1', 'result-m1', 'result-m2', 'result-m3', 'champion-c1']);
    expect(items[1]).toMatchObject({ text: 'Mayhem Monday · Nov 9', to: '/events/e2' });
    expect(items[2]).toMatchObject({ text: 'Strike system', to: '/news/a1' });
    expect(items[3]).toMatchObject({ text: 'RoySzn dashboard.def Devlin', to: '/events/e0' });
    expect(items[4]).toMatchObject({ text: 'A vs B dashboard.draw', to: '/matches' });
    expect(items[5]).toMatchObject({ tag: 'ticker.tags.titleMatch', tagTone: 'prestige', text: 'Lynx dashboard.def Kai · World Title' });
  });

  it('has no headlines without data', () => {
    const empty: LeaguePulse = { dashboard: null, news: [] };
    expect(buildTickerItems(empty, t)).toEqual([]);
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
    expect(container.querySelector('.ui-ticker__list[aria-hidden="true"]')).toHaveAttribute('inert');
    expect(screen.getAllByRole('link', { name: 'Big news' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(container.querySelector('.ui-ticker')).toHaveClass('ui-ticker--paused');
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
