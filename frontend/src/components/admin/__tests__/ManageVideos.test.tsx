import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockVideosApi, mockEpisodesApi } = vi.hoisted(() => ({
  mockVideosApi: { getAll: vi.fn(), update: vi.fn(), create: vi.fn() },
  mockEpisodesApi: { getAll: vi.fn() },
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api', () => ({
  videosApi: mockVideosApi,
  episodesApi: mockEpisodesApi,
  imagesApi: {},
}));

import ManageVideos from '../ManageVideos';

const storedUrl = 'https://wwe-2k-league-api-images-devtest.s3.amazonaws.com/videos/1b83270d-e5ea-4b5e-af9f-1f5202043557.mp4';

describe('ManageVideos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEpisodesApi.getAll.mockResolvedValue([
      { episodeId: 'ep1', title: 'Season 5 Night 1', airDate: '2026-11-20', isPublished: true },
      { episodeId: 'ep2', title: 'Season 5 Night 2', airDate: '2026-11-27', isPublished: false },
    ]);
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

  it('links a highlight to an episode from the picker', async () => {
    const user = userEvent.setup();
    mockVideosApi.update.mockResolvedValue({});
    render(<ManageVideos />);

    await screen.findByText('Main Event');
    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('combobox', { name: 'videos.fields.episode' }));
    await user.click(await screen.findByRole('option', { name: 'Season 5 Night 2' }));
    await user.click(screen.getByRole('button', { name: 'Update Video' }));

    expect(mockVideosApi.update).toHaveBeenCalledWith('v1', expect.objectContaining({ episodeId: 'ep2', isPublished: true }));
  });

  it('sends null to unlink an episode', async () => {
    const user = userEvent.setup();
    mockVideosApi.getAll.mockResolvedValue([{
      videoId: 'v3',
      title: 'Linked clip',
      description: '',
      videoUrl: storedUrl,
      category: 'highlight',
      tags: [],
      isPublished: true,
      episodeId: 'ep1',
      createdAt: '2026-01-03',
      updatedAt: '2026-01-03',
    }]);
    mockVideosApi.update.mockResolvedValue({});
    render(<ManageVideos />);

    expect(await screen.findByText('Season 5 Night 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('combobox', { name: 'videos.fields.episode' }));
    await user.click(await screen.findByRole('option', { name: 'videos.noEpisode' }));
    await user.click(screen.getByRole('button', { name: 'Update Video' }));

    expect(mockVideosApi.update).toHaveBeenCalledWith('v3', expect.objectContaining({ episodeId: null }));
  });

  it('keeps a draft a draft when it is linked to an episode', async () => {
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
    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('combobox', { name: 'videos.fields.episode' }));
    await user.click(await screen.findByRole('option', { name: 'Season 5 Night 1' }));
    await user.click(screen.getByRole('button', { name: 'Update Video' }));

    expect(mockVideosApi.update).toHaveBeenCalledWith('v2', expect.objectContaining({ episodeId: 'ep1', isPublished: false }));
  });

  it('still lists videos when episodes fail to load', async () => {
    mockEpisodesApi.getAll.mockRejectedValue(new Error('down'));
    render(<ManageVideos />);
    expect(await screen.findByText('Main Event')).toBeInTheDocument();
  });
});
