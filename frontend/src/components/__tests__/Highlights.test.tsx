import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Video } from '../../types';

const { mockGetPublished } = vi.hoisted(() => ({ mockGetPublished: vi.fn() }));

vi.mock('../../services/api', () => ({ videosApi: { getPublished: mockGetPublished } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import Highlights from '../Highlights';

const video = {
  videoId: 'v1',
  title: 'Cage match',
  description: 'The full bout',
  category: 'match',
  tags: ['cage', 'title'],
  videoUrl: '/videos/v1.mp4',
  createdAt: '2026-10-01T00:00:00.000Z',
} as Video;

describe('Highlights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublished.mockResolvedValue([video]);
  });

  it('shows the page heading and published videos', async () => {
    render(<Highlights />);
    expect(screen.getByRole('heading', { level: 1, name: 'highlights.title' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Cage match' })).toBeInTheDocument();
    expect(screen.getByText('cage · title')).toBeInTheDocument();
  });

  it('filters by category through the API', async () => {
    render(<Highlights />);
    await screen.findByText('Cage match');
    await userEvent.click(screen.getByRole('tab', { name: 'videos.categories.promo' }));
    await waitFor(() => expect(mockGetPublished).toHaveBeenLastCalledWith('promo', expect.any(AbortSignal)));
  });

  it('shows the empty state', async () => {
    mockGetPublished.mockResolvedValue([]);
    render(<Highlights />);
    expect(await screen.findByText('highlights.noVideos')).toBeInTheDocument();
  });

  it('clears an earlier error after a retry succeeds', async () => {
    mockGetPublished.mockRejectedValueOnce(new Error('Network error'));
    render(<Highlights />);
    expect(await screen.findByText('Network error')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'common.retry' }));

    expect(await screen.findByText('Cage match')).toBeInTheDocument();
    expect(screen.queryByText('Network error')).not.toBeInTheDocument();
  });
});
