import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Episode } from '../../../types';

const { mockGetEpisodes, mockGetVideos } = vi.hoisted(() => ({
  mockGetEpisodes: vi.fn(),
  mockGetVideos: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  episodesApi: { getPublished: mockGetEpisodes },
  videosApi: { getPublished: mockGetVideos },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import Episodes from '../Episodes';

const episode: Episode = {
  episodeId: 'e1',
  source: 'youtube',
  youtubeVideoId: 'dQw4w9WgXcQ',
  title: 'Season 5 Night 1',
  description: '',
  thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  airDate: '2026-11-20',
  eventId: 'ev1',
  isPublished: true,
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/episodes" element={<Episodes />} />
        <Route path="/episodes/highlights" element={<Episodes />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Episodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEpisodes.mockResolvedValue([episode]);
    mockGetVideos.mockResolvedValue([]);
  });

  it('owns the page h1 and shows both tabs, Full Episodes active', async () => {
    renderAt('/episodes');
    expect(screen.getByRole('heading', { level: 1, name: 'episodes.title' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'episodes.tabs.full' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'episodes.tabs.highlights' })).toHaveAttribute('href', '/episodes/highlights');
    await screen.findByText('Season 5 Night 1');
  });

  it('lists published episodes as cards that open the episode page', async () => {
    renderAt('/episodes');
    const card = await screen.findByRole('link', { name: /Season 5 Night 1/ });
    expect(card).toHaveAttribute('href', '/episodes/e1');
    expect(card.querySelector('img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(screen.getByText('episodes.hasEvent')).toBeInTheDocument();
    // The grid stays light: no players in the list.
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('shows the empty state', async () => {
    mockGetEpisodes.mockResolvedValue([]);
    renderAt('/episodes');
    expect(await screen.findByText('episodes.noEpisodes')).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    mockGetEpisodes.mockRejectedValueOnce(new Error('Network error'));
    renderAt('/episodes');
    expect(await screen.findByText('Network error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(await screen.findByText('Season 5 Night 1')).toBeInTheDocument();
  });

  it('routes to the Highlights tab', async () => {
    renderAt('/episodes');
    await screen.findByText('Season 5 Night 1');
    await userEvent.click(screen.getByRole('link', { name: 'episodes.tabs.highlights' }));
    expect(await screen.findByText('highlights.noVideos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'episodes.tabs.highlights' })).toHaveAttribute('aria-current', 'page');
    expect(mockGetVideos).toHaveBeenCalled();
  });

  it('opens on Highlights at /episodes/highlights', async () => {
    renderAt('/episodes/highlights');
    expect(await screen.findByText('highlights.noVideos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'episodes.title' })).toBeInTheDocument();
  });
});
