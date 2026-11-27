import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockVideosApi } = vi.hoisted(() => ({
  mockVideosApi: { getAll: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api', () => ({
  videosApi: mockVideosApi,
  imagesApi: {},
}));

import ManageVideos from '../ManageVideos';

const storedUrl = 'https://wwe-2k-league-api-images-devtest.s3.amazonaws.com/videos/1b83270d-e5ea-4b5e-af9f-1f5202043557.mp4';

describe('ManageVideos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVideosApi.getAll.mockResolvedValue([{
      videoId: 'v1',
      title: 'Main Event',
      description: '',
      videoUrl: storedUrl,
      thumbnailUrl: 'https://wwe-2k-league-api-images-devtest.s3.amazonaws.com/images/thumb-1b83270d.png',
      category: 'highlight',
      tags: [],
      isPublished: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }]);
  });

  it('says a file is attached without printing its storage address', async () => {
    const user = userEvent.setup();
    render(<ManageVideos />);

    await screen.findByText('Main Event');
    await user.click(screen.getAllByRole('button', { name: /edit/i })[0]);

    expect(await screen.findByText('videos.currentVideoHint')).toBeInTheDocument();
    expect(screen.getByText('videos.currentThumbnailHint')).toBeInTheDocument();
    expect(screen.queryByText(/amazonaws/)).not.toBeInTheDocument();
  });

  it('keeps a draft a draft when it is edited and saved', async () => {
    const user = userEvent.setup();
    mockVideosApi.getAll.mockResolvedValue([{
      videoId: 'v2',
      title: 'Wrestler draft',
      description: '',
      videoUrl: storedUrl,
      category: 'promo',
      tags: [],
      isPublished: false,
      createdAt: '2026-01-02',
      updatedAt: '2026-01-02',
    }]);
    mockVideosApi.update.mockResolvedValue({});
    render(<ManageVideos />);

    await screen.findByText('Wrestler draft');
    expect(screen.getByText('videos.draft')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByRole('checkbox', { name: 'videos.fields.published' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Update Video' }));

    expect(mockVideosApi.update).toHaveBeenCalledWith('v2', expect.objectContaining({ isPublished: false }));
  });
});
