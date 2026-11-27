import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Episode } from '../../../types';

const { mockEpisodesApi, mockEventsApi } = vi.hoisted(() => ({
  mockEpisodesApi: { getAll: vi.fn(), lookup: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  mockEventsApi: { getAll: vi.fn() },
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api', () => ({
  episodesApi: mockEpisodesApi,
  eventsApi: mockEventsApi,
  isApiError: (err: unknown, status: number) => (err as { status?: number }).status === status,
}));
// The live stream panel has its own test.
vi.mock('../LiveStreamPanel', () => ({ default: () => <section>LiveStreamPanel</section> }));

import ManageEpisodes from '../ManageEpisodes';

const VIDEO_ID = 'dQw4w9WgXcQ';

const draft: Episode = {
  episodeId: 'ep1',
  source: 'youtube',
  youtubeVideoId: VIDEO_ID,
  title: 'Night 1 draft',
  description: 'Notes',
  thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
  airDate: '2026-11-20',
  eventId: 'ev-gone',
  isPublished: false,
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
};

const events = [
  { eventId: 'ev1', name: 'Survivor Series', date: '2026-11-20T20:00:00.000Z', eventType: 'ppv', status: 'completed' },
  { eventId: 'ev2', name: 'Weekly Show', date: '2026-11-27T20:00:00.000Z', eventType: 'weekly', status: 'upcoming' },
];

async function openAddForm(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('episodes.admin.allEpisodes (1)');
  await user.click(screen.getByRole('button', { name: 'episodes.admin.add' }));
  return screen.getByRole('dialog');
}

describe('ManageEpisodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEpisodesApi.getAll.mockResolvedValue([draft]);
    mockEventsApi.getAll.mockResolvedValue(events);
    mockEpisodesApi.create.mockResolvedValue({ ...draft, episodeId: 'ep2' });
    mockEpisodesApi.update.mockResolvedValue(draft);
  });

  it('lists episodes with a draft badge and flags a link to a deleted event', async () => {
    render(<ManageEpisodes />);

    expect(await screen.findByText('Night 1 draft')).toBeInTheDocument();
    expect(screen.getByText('videos.draft')).toBeInTheDocument();
    expect(screen.getByText('episodes.admin.eventMissing')).toBeInTheDocument();
    expect(screen.getByText('LiveStreamPanel')).toBeInTheDocument();
  });

  it('fills the title from the YouTube lookup', async () => {
    const user = userEvent.setup();
    mockEpisodesApi.lookup.mockResolvedValue({
      youtubeVideoId: VIDEO_ID,
      title: 'Season 5 Night 1',
      channelName: 'League SZN',
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      oembedAvailable: true,
    });
    render(<ManageEpisodes />);
    const dialog = await openAddForm(user);

    await user.type(within(dialog).getByLabelText('episodes.admin.youtubeUrl'), `https://youtu.be/${VIDEO_ID}`);
    await user.click(within(dialog).getByRole('button', { name: 'episodes.admin.fetchDetails' }));

    expect(mockEpisodesApi.lookup).toHaveBeenCalledWith(`https://youtu.be/${VIDEO_ID}`);
    expect(await within(dialog).findByDisplayValue('Season 5 Night 1')).toBeInTheDocument();
    expect(within(dialog).getByText('episodes.admin.channel')).toBeInTheDocument();
  });

  it('shows an inline error for a link that is not a YouTube video', async () => {
    const user = userEvent.setup();
    mockEpisodesApi.lookup.mockRejectedValue(Object.assign(new Error('Not a YouTube video link'), { status: 400 }));
    render(<ManageEpisodes />);
    const dialog = await openAddForm(user);

    await user.type(within(dialog).getByLabelText('episodes.admin.youtubeUrl'), 'https://vimeo.com/123');
    await user.click(within(dialog).getByRole('button', { name: 'episodes.admin.fetchDetails' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('episodes.admin.invalidUrl');
  });

  it('warns about a duplicate video', async () => {
    const user = userEvent.setup();
    mockEpisodesApi.lookup.mockResolvedValue({
      youtubeVideoId: VIDEO_ID,
      title: 'Night 1',
      thumbnailUrl: '',
      oembedAvailable: true,
      existingEpisodeId: 'ep1',
    });
    render(<ManageEpisodes />);
    const dialog = await openAddForm(user);

    await user.type(within(dialog).getByLabelText('episodes.admin.youtubeUrl'), VIDEO_ID);
    await user.click(within(dialog).getByRole('button', { name: 'episodes.admin.fetchDetails' }));

    expect(await within(dialog).findByText('episodes.admin.duplicate')).toBeInTheDocument();
  });

  it('still saves with a typed title when YouTube details are unavailable', async () => {
    const user = userEvent.setup();
    mockEpisodesApi.lookup.mockResolvedValue({
      youtubeVideoId: VIDEO_ID,
      title: '',
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      oembedAvailable: false,
    });
    render(<ManageEpisodes />);
    const dialog = await openAddForm(user);

    await user.type(within(dialog).getByLabelText('episodes.admin.youtubeUrl'), VIDEO_ID);
    await user.click(within(dialog).getByRole('button', { name: 'episodes.admin.fetchDetails' }));
    expect(await within(dialog).findByText('episodes.admin.oembedUnavailable')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('episodes.admin.fields.title'), 'Typed title');
    await user.click(within(dialog).getByRole('button', { name: 'episodes.admin.save' }));

    await waitFor(() => expect(mockEpisodesApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: VIDEO_ID, title: 'Typed title', isPublished: false }),
    ));
  });

  it('creates an episode with the event, published flag and title', async () => {
    const user = userEvent.setup();
    render(<ManageEpisodes />);
    const dialog = await openAddForm(user);

    await user.type(within(dialog).getByLabelText('episodes.admin.youtubeUrl'), `https://www.youtube.com/watch?v=${VIDEO_ID}`);
    await user.type(within(dialog).getByLabelText('episodes.admin.fields.title'), 'Season 5 Night 1');
    await user.click(within(dialog).getByRole('combobox', { name: 'episodes.admin.fields.event' }));
    await user.click(await screen.findByRole('option', { name: /Survivor Series/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'episodes.admin.fields.published' }));
    await user.click(within(dialog).getByRole('button', { name: 'episodes.admin.save' }));

    await waitFor(() => expect(mockEpisodesApi.create).toHaveBeenCalledWith(expect.objectContaining({
      url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      title: 'Season 5 Night 1',
      eventId: 'ev1',
      isPublished: true,
    })));
    expect(await screen.findByText('episodes.admin.createSuccess')).toBeInTheDocument();
  });

  it('keeps a draft a draft and clears a link to a deleted event on edit', async () => {
    const user = userEvent.setup();
    render(<ManageEpisodes />);
    await screen.findByText('Night 1 draft');

    await user.click(screen.getByRole('button', { name: 'common.edit' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: 'episodes.admin.fields.published' })).not.toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'episodes.admin.save' }));

    await waitFor(() => expect(mockEpisodesApi.update).toHaveBeenCalled());
    const [episodeId, patch] = mockEpisodesApi.update.mock.calls[0];
    expect(episodeId).toBe('ep1');
    expect(patch).toEqual(expect.objectContaining({ isPublished: false, eventId: null, title: 'Night 1 draft' }));
    // The video did not change, so the URL is not resent.
    expect(patch).not.toHaveProperty('url');
  });

  it('deletes an episode after confirming', async () => {
    const user = userEvent.setup();
    mockEpisodesApi.delete.mockResolvedValue(undefined);
    render(<ManageEpisodes />);
    await screen.findByText('Night 1 draft');

    await user.click(screen.getByRole('button', { name: 'common.delete' }));
    const confirmDialog = await screen.findByRole('dialog');
    await user.click(within(confirmDialog).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(mockEpisodesApi.delete).toHaveBeenCalledWith('ep1'));
    expect(await screen.findByText('episodes.admin.deleteSuccess')).toBeInTheDocument();
  });
});
