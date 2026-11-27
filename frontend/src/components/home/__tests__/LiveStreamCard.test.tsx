import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('../../../services/api', () => ({ liveStreamApi: { get: mockGet } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => (values?.channel ? `${key}:${values.channel}` : key),
  }),
}));

import LiveStreamCard from '../LiveStreamCard';

const live = { channel: 'leagueszn', isLive: true, title: 'Season 5 Night 1', liveSince: '2026-11-27T20:00:00.000Z' };

let visibility: DocumentVisibilityState = 'visible';

/** Lets the pending fetch promise settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('LiveStreamCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    mockGet.mockResolvedValue(live);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders nothing while the stream is offline', async () => {
    mockGet.mockResolvedValue({ channel: 'leagueszn', isLive: false });
    const { container } = render(<LiveStreamCard />);
    await flush();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when live without a channel', async () => {
    mockGet.mockResolvedValue({ channel: '', isLive: true });
    const { container } = render(<LiveStreamCard />);
    await flush();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the LIVE badge, title and a placeholder with no iframe until clicked', async () => {
    const { container } = render(<LiveStreamCard />);
    await flush();

    expect(screen.getByText('liveStream.live')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Season 5 Night 1' })).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('falls back to the default title', async () => {
    mockGet.mockResolvedValue({ ...live, title: '' });
    render(<LiveStreamCard />);
    await flush();
    expect(screen.getByRole('heading', { name: 'liveStream.defaultTitle' })).toBeInTheDocument();
  });

  it('loads the Twitch player with this host as parent after a click', async () => {
    render(<LiveStreamCard />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'liveStream.play' }));

    const frame = screen.getByTitle('liveStream.playerTitle:leagueszn');
    const src = new URL(frame.getAttribute('src') ?? '');
    expect(src.origin).toBe('https://player.twitch.tv');
    expect(src.searchParams.get('channel')).toBe('leagueszn');
    expect(src.searchParams.get('parent')).toBe(window.location.hostname);
    expect(src.searchParams.get('autoplay')).toBe('true');
    expect(frame).toHaveFocus();
  });

  it('links to the channel on Twitch in a new tab', async () => {
    render(<LiveStreamCard />);
    await flush();

    const link = screen.getByRole('link', { name: 'liveStream.watchOnTwitch' });
    expect(link).toHaveAttribute('href', 'https://www.twitch.tv/leagueszn');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('polls every 60 seconds while visible and skips hidden tabs', async () => {
    render(<LiveStreamCard />);
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockGet).toHaveBeenCalledTimes(2);

    visibility = 'hidden';
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(mockGet).toHaveBeenCalledTimes(2);

    visibility = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('disappears when a poll finds the stream ended', async () => {
    render(<LiveStreamCard />);
    await flush();
    expect(screen.getByText('liveStream.live')).toBeInTheDocument();

    mockGet.mockResolvedValue({ channel: 'leagueszn', isLive: false });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();
    expect(screen.queryByText('liveStream.live')).not.toBeInTheDocument();
  });

  it('stops polling and aborts on unmount', async () => {
    const { unmount } = render(<LiveStreamCard />);
    await flush();
    const signal = mockGet.mock.calls[0][0] as AbortSignal;
    unmount();

    expect(signal.aborted).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
