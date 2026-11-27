import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Episode, Video } from '../../../types';

const { mockGetPublished, mockGetEpisodes } = vi.hoisted(() => ({
  mockGetPublished: vi.fn(),
  mockGetEpisodes: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  videosApi: { getPublished: mockGetPublished },
  episodesApi: { getPublished: mockGetEpisodes },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => (values?.title ? `${key}:${values.title}` : key),
  }),
}));

import HighlightsList from '../HighlightsList';

const video = {
  videoId: 'v1',
  title: 'Cage match',
  description: 'The full bout',
  category: 'match',
  tags: ['cage', 'title'],
  videoUrl: '/videos/v1.mp4',
  createdAt: '2026-10-01T00:00:00.000Z',
} as Video;

const episode = { episodeId: 'e1', title: 'Night 1' } as Episode;

function renderList() {
  return render(<MemoryRouter><HighlightsList /></MemoryRouter>);
}

describe('HighlightsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublished.mockResolvedValue([video]);
    mockGetEpisodes.mockResolvedValue([episode]);
  });

  it('shows published videos', async () => {
    renderList();
    expect(await screen.findByRole('heading', { name: 'Cage match' })).toBeInTheDocument();
    expect(screen.getByText('cage · title')).toBeInTheDocument();
  });

  it('filters by category through the API', async () => {
    renderList();
    await screen.findByText('Cage match');
    await userEvent.click(screen.getByRole('tab', { name: 'videos.categories.promo' }));
    await waitFor(() => expect(mockGetPublished).toHaveBeenLastCalledWith('promo', expect.any(AbortSignal)));
  });

  it('shows the empty state', async () => {
    mockGetPublished.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText('highlights.noVideos')).toBeInTheDocument();
  });

  it('clears an earlier error after a retry succeeds', async () => {
    mockGetPublished.mockRejectedValueOnce(new Error('Network error'));
    renderList();
    expect(await screen.findByText('Network error')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'common.retry' }));

    expect(await screen.findByText('Cage match')).toBeInTheDocument();
    expect(screen.queryByText('Network error')).not.toBeInTheDocument();
  });

  it('links a highlight to its episode', async () => {
    mockGetPublished.mockResolvedValue([{ ...video, episodeId: 'e1' }]);
    renderList();
    const link = await screen.findByRole('link', { name: 'episodes.fromEpisode:Night 1' });
    expect(link).toHaveAttribute('href', '/episodes/e1');
  });

  it('still shows the videos, without episode links, when episodes fail to load', async () => {
    mockGetPublished.mockResolvedValue([{ ...video, episodeId: 'e1' }]);
    mockGetEpisodes.mockRejectedValue(new Error('down'));
    renderList();
    expect(await screen.findByText('Cage match')).toBeInTheDocument();
    await waitFor(() => expect(mockGetEpisodes).toHaveBeenCalled());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('hides the link when the episode is not published', async () => {
    mockGetPublished.mockResolvedValue([{ ...video, episodeId: 'draft-episode' }]);
    renderList();
    expect(await screen.findByText('Cage match')).toBeInTheDocument();
    await waitFor(() => expect(mockGetEpisodes).toHaveBeenCalled());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
