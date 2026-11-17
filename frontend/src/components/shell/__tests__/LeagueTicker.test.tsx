import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Ticker, { TICKER_FADE_INTERVAL_MS } from '../../ui/Ticker';
import type { TickerFeed, TickerScrollSpeed } from '../../../services/api';

const { mockGetTicker } = vi.hoisted(() => ({ mockGetTicker: vi.fn() }));

vi.mock('../../../services/api', () => ({ tickerApi: { get: mockGetTicker } }));

const siteConfig = vi.hoisted(() => ({ scrollSpeed: 'normal' as TickerScrollSpeed }));
vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({ tickerSettings: { scrollSpeed: siteConfig.scrollSpeed } }),
}));

/** Echoes keys, appends params, and knows only the ticker's own keys. */
const i18nStub = {
  language: 'en',
  exists: (key: string) => key.startsWith('ticker.'),
};
const tStub = (key: string, params?: Record<string, unknown>) =>
  (params && Object.keys(params).length > 0 ? `${key}:${Object.values(params).join('|')}` : key);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: tStub, i18n: i18nStub }) }));

import LeagueTicker, { TICKER_DISMISSED_KEY } from '../LeagueTicker';
import { feedToTickerItems, isTickerHiddenPath } from '../tickerItems';
import { resetTickerFeed } from '../../../hooks/useTickerFeed';
import type { TFunction, i18n as I18n } from 'i18next';

const FEED: TickerFeed = {
  generatedAt: '2026-11-16T12:00:00.000Z',
  segments: [
    {
      key: 'tonight',
      labelKey: 'ticker.segments.tonight',
      priority: 10,
      items: [
        { text: 'Raw', href: '/events/e1' },
        { text: 'Next PPV in 3 days: Mania', textKey: 'ticker.nextPpvText', textParams: { count: 3, name: 'Mania' }, href: '/events/e2' },
      ],
    },
    {
      key: 'custom',
      labelKey: 'ticker.segments.custom',
      priority: 50,
      items: [{ text: 'Read the rules', href: 'https://example.com/rules' }, { text: 'No link here' }],
    },
  ],
};

function renderTickerAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LeagueTicker />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  siteConfig.scrollSpeed = 'normal';
  resetTickerFeed();
  window.sessionStorage.clear();
  mockGetTicker.mockReset().mockResolvedValue(FEED);
});

describe('feedToTickerItems', () => {
  it('gives every headline its segment pill, translates textKeys and splits site links from outside ones', () => {
    const items = feedToTickerItems(FEED.segments, tStub as unknown as TFunction, i18nStub as unknown as I18n);
    expect(items).toEqual([
      { id: 'tonight-0', text: 'Raw', tag: 'ticker.segments.tonight', tagTone: 'action', to: '/events/e1' },
      { id: 'tonight-1', text: 'ticker.nextPpvText:3|Mania', tag: 'ticker.segments.tonight', tagTone: 'action', to: '/events/e2' },
      { id: 'custom-0', text: 'Read the rules', tag: 'ticker.segments.custom', tagTone: 'neutral', externalHref: 'https://example.com/rules' },
      { id: 'custom-1', text: 'No link here', tag: 'ticker.segments.custom', tagTone: 'neutral' },
    ]);
  });

  it('falls back to the plain text when the textKey is unknown', () => {
    const items = feedToTickerItems(
      [{ key: 'news', labelKey: 'other.label', priority: 60, items: [{ text: 'Fallback', textKey: 'other.key' }] }],
      tStub as unknown as TFunction,
      i18nStub as unknown as I18n,
    );
    expect(items).toEqual([{ id: 'news-0', text: 'Fallback' }]);
  });
});

describe('isTickerHiddenPath', () => {
  it('hides on admin and sign-in pages only', () => {
    expect(isTickerHiddenPath('/admin')).toBe(true);
    expect(isTickerHiddenPath('/admin/players')).toBe(true);
    expect(isTickerHiddenPath('/login')).toBe(true);
    expect(isTickerHiddenPath('/signup')).toBe(true);
    expect(isTickerHiddenPath('/forgot-password')).toBe(true);
    expect(isTickerHiddenPath('/')).toBe(false);
    expect(isTickerHiddenPath('/standings')).toBe(false);
    expect(isTickerHiddenPath('/administrators')).toBe(false);
  });
});

describe('LeagueTicker', () => {
  it('holds its height while loading, then renders each segment with one pill and router links', async () => {
    renderTickerAt('/');
    expect(screen.getByTestId('league-ticker-pending')).toBeInTheDocument();

    const region = await screen.findByRole('region', { name: 'ticker.ariaLabel' });
    expect(region).toHaveClass('league-ticker');
    const firstCopy = region.querySelector('.ui-ticker__list:not([aria-hidden])');
    expect(firstCopy?.querySelectorAll('.ui-ticker__tag')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'ticker.segments.tonight Raw' })).toHaveAttribute('href', '/events/e1');
    expect(screen.getByRole('link', { name: 'ticker.nextPpvText:3|Mania' })).toHaveAttribute('href', '/events/e2');
    const outside = screen.getByRole('link', { name: 'ticker.segments.custom Read the rules' });
    expect(outside).toHaveAttribute('href', 'https://example.com/rules');
    expect(outside).toHaveAttribute('target', '_blank');
    expect(mockGetTicker).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when the feed has no segments', async () => {
    mockGetTicker.mockResolvedValue({ segments: [], generatedAt: '' });
    const { container } = renderTickerAt('/');
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing when the feed fails', async () => {
    mockGetTicker.mockRejectedValue(new Error('down'));
    const { container } = renderTickerAt('/');
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it.each(['/admin/players', '/login'])('stays off %s and loads nothing', (path) => {
    const { container } = renderTickerAt(path);
    expect(container).toBeEmptyDOMElement();
    expect(mockGetTicker).not.toHaveBeenCalled();
  });

  it.each<TickerScrollSpeed>(['slow', 'normal', 'fast'])('crawls at the %s scroll speed from the ticker settings', async (speed) => {
    siteConfig.scrollSpeed = speed;
    renderTickerAt('/');
    const region = await screen.findByRole('region', { name: 'ticker.ariaLabel' });
    expect(region).toHaveClass(`ui-ticker--speed-${speed}`);
    const others = (['slow', 'normal', 'fast'] as const).filter((other) => other !== speed);
    for (const other of others) expect(region).not.toHaveClass(`ui-ticker--speed-${other}`);
  });

  it('closes for the visit with the dismiss button', async () => {
    const first = renderTickerAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'ticker.dismiss' }));
    expect(first.container).toBeEmptyDOMElement();
    expect(window.sessionStorage.getItem(TICKER_DISMISSED_KEY)).toBe('1');
    first.unmount();

    const second = renderTickerAt('/');
    expect(second.container).toBeEmptyDOMElement();
  });
});

describe('LeagueTicker refresh', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('reloads every two minutes while the tab is visible, and not while it is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderTickerAt('/');
    await waitFor(() => expect(mockGetTicker).toHaveBeenCalledTimes(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60 * 1000); });
    expect(mockGetTicker).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60 * 1000); });
    expect(mockGetTicker).toHaveBeenCalledTimes(2);

    // Back on the tab with a stale feed: one reload at once.
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(mockGetTicker).toHaveBeenCalledTimes(3);
  });
});

describe('Ticker', () => {
  const props = { label: 'Wire', ariaLabel: 'News ticker', pauseLabel: 'Pause', resumeLabel: 'Resume' };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('crawls at normal speed by default and at the speed it is given', () => {
    const items = [{ id: 'one', text: 'Big news' }];
    const { container, rerender } = render(<MemoryRouter><Ticker {...props} items={items} /></MemoryRouter>);
    expect(container.querySelector('.ui-ticker')).toHaveClass('ui-ticker--speed-normal');
    rerender(<MemoryRouter><Ticker {...props} items={items} speed="fast" /></MemoryRouter>);
    expect(container.querySelector('.ui-ticker')).toHaveClass('ui-ticker--speed-fast');
  });

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

  it('leaves a headline with nowhere to go as plain text', () => {
    render(<MemoryRouter><Ticker {...props} items={[{ id: 'one', text: 'Just words', tag: 'Results' }]} /></MemoryRouter>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByText('Just words')).toHaveLength(2);
  });

  it.each([
    ['a short headline', [{ id: 'a', text: 'Short' }], '1'],
    ['a long headline', [{ id: 'a', text: 'x'.repeat(100) }], '3'],
    // 60 characters plus one shared "Tonight" pill.
    ['a run sharing one pill', [{ id: 'a', text: 'x'.repeat(30), tag: 'Tonight' }, { id: 'b', text: 'x'.repeat(30), tag: 'Tonight' }], '2'],
    ['a huge crawl, capped', [{ id: 'a', text: 'x'.repeat(100_000) }], '48'],
  ])('scales the crawl with its content length: %s', (_name, items, steps) => {
    const { container } = render(<MemoryRouter><Ticker {...props} items={items} /></MemoryRouter>);
    expect(container.querySelector('.ui-ticker__track')).toHaveAttribute('data-steps', steps);
  });

  it('cross-fades one headline at a time for reduced motion, holding while hovered', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(
      <MemoryRouter>
        <Ticker
          {...props}
          speed="fast"
          items={[{ id: 'one', text: 'First', tag: 'Tonight' }, { id: 'two', text: 'Second', tag: 'Tonight' }]}
        />
      </MemoryRouter>,
    );
    const strip = container.querySelector('.ui-ticker');
    expect(strip).toHaveClass('ui-ticker--fading');
    // The scroll speed only applies to the crawl; the fade keeps its own pace.
    expect(strip).not.toHaveClass('ui-ticker--speed-fast');
    expect(container.querySelector('.ui-ticker__track')).not.toBeInTheDocument();
    expect(screen.getByTestId('ticker-fade-item')).toHaveTextContent('TonightFirst');
    expect(screen.queryByText('Second')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(TICKER_FADE_INTERVAL_MS); });
    expect(screen.getByTestId('ticker-fade-item')).toHaveTextContent('TonightSecond');

    fireEvent.mouseEnter(strip!);
    act(() => { vi.advanceTimersByTime(TICKER_FADE_INTERVAL_MS * 3); });
    expect(screen.getByTestId('ticker-fade-item')).toHaveTextContent('Second');

    fireEvent.mouseLeave(strip!);
    act(() => { vi.advanceTimersByTime(TICKER_FADE_INTERVAL_MS); });
    expect(screen.getByTestId('ticker-fade-item')).toHaveTextContent('First');
  });

  it('shows a lone headline for reduced motion with no pause button', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<MemoryRouter><Ticker {...props} items={[{ id: 'one', text: 'Big news' }]} /></MemoryRouter>);
    expect(screen.getByTestId('ticker-fade-item')).toHaveTextContent('Big news');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
