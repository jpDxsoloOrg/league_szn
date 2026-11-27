import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Episode, Video } from '../../../types';
import type { EventWithMatches } from '../../../types/event';

const { api } = vi.hoisted(() => ({
  api: { getEpisode: vi.fn(), getEvent: vi.fn() },
}));

vi.mock('../../../services/api', () => ({
  episodesApi: { getById: api.getEpisode },
  eventsApi: { getById: api.getEvent },
  isApiError: (err: unknown, status: number) => (err as { status?: number }).status === status,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => (values?.title ? `${key}:${values.title}` : key),
    i18n: { language: 'en' },
  }),
}));

import EpisodeDetail from '../EpisodeDetail';

const VIDEO_ID = 'dQw4w9WgXcQ';

const episode: Episode = {
  episodeId: 'ep1',
  source: 'youtube',
  youtubeVideoId: VIDEO_ID,
  title: 'Season 5 Night 1',
  description: 'First paragraph.\n\n<b>Second</b> paragraph.',
  thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
  channelName: 'League SZN',
  airDate: '2026-11-20',
  eventId: 'ev1',
  isPublished: true,
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
};

const highlight = {
  videoId: 'v1',
  title: 'Main event finish',
  description: '',
  videoUrl: '/videos/v1.mp4',
  category: 'highlight',
  tags: [],
  isPublished: true,
  episodeId: 'ep1',
  createdAt: '2026-11-21T00:00:00.000Z',
  updatedAt: '2026-11-21T00:00:00.000Z',
} as Video;

const event = {
  eventId: 'ev1',
  name: 'Survivor Series',
  eventType: 'ppv',
  date: '2026-11-20',
  status: 'completed',
  matchCards: [],
  createdAt: '',
  updatedAt: '',
  enrichedMatches: [
    {
      position: 1,
      matchId: 'm1',
      designation: 'main-event',
      matchData: {
        matchId: 'm1',
        matchFormat: 'singles',
        participants: [
          { playerId: 'p1', playerName: 'Alice', wrestlerName: 'Alpha' },
          { playerId: 'p2', playerName: 'Bob', wrestlerName: 'Bravo' },
        ],
        winners: ['p1'],
        losers: ['p2'],
        isChampionship: true,
        championshipName: 'World Title',
        status: 'completed',
      },
    },
  ],
} as EventWithMatches;

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/episodes/ep1']}>
      <Routes>
        <Route path="/episodes/:episodeId" element={<EpisodeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EpisodeDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getEpisode.mockResolvedValue({ episode, highlights: [highlight] });
    api.getEvent.mockResolvedValue(event);
  });

  it('renders the player, plain-text description, event card and highlights', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'Season 5 Night 1' })).toBeInTheDocument();
    expect(api.getEpisode).toHaveBeenCalledWith('ep1', expect.any(AbortSignal));
    expect(screen.getByRole('button', { name: 'episodes.play:Season 5 Night 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'episodes.watchOnYoutube' })).toHaveAttribute('href', `https://www.youtube.com/watch?v=${VIDEO_ID}`);
    // Description is text, never HTML.
    expect(screen.getByText('<b>Second</b> paragraph.')).toBeInTheDocument();
    expect(document.querySelector('.episode-detail__description b')).toBeNull();

    const card = await screen.findByRole('region', { name: 'episodes.detail.onTheCard' });
    expect(within(card).getByRole('link', { name: 'Survivor Series' })).toHaveAttribute('href', '/events/ev1');
    expect(within(card).getByText('World Title')).toBeInTheDocument();
    expect(within(card).getByText('Alpha').closest('.episode-event__side')).toHaveClass('episode-event__side--winner');
    expect(within(card).getByText('Bravo').closest('.episode-event__side')).not.toHaveClass('episode-event__side--winner');
    expect(within(card).getByRole('link', { name: 'episodes.detail.viewResults' })).toHaveAttribute('href', '/events/ev1/results');

    const highlights = screen.getByRole('region', { name: 'episodes.detail.highlights' });
    expect(within(highlights).getByRole('heading', { name: 'Main event finish' })).toBeInTheDocument();
  });

  it('shows no event section when the episode has no event', async () => {
    api.getEpisode.mockResolvedValue({ episode: { ...episode, eventId: undefined }, highlights: [] });
    renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'Season 5 Night 1' })).toBeInTheDocument();
    expect(api.getEvent).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'episodes.detail.onTheCard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'episodes.detail.highlights' })).not.toBeInTheDocument();
  });

  it('hides the event section when the linked event is gone', async () => {
    api.getEvent.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
    renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'Season 5 Night 1' })).toBeInTheDocument();
    await waitFor(() => expect(api.getEvent).toHaveBeenCalledWith('ev1', expect.any(AbortSignal)));
    expect(screen.queryByRole('region', { name: 'episodes.detail.onTheCard' })).not.toBeInTheDocument();
  });

  it('shows not found with a way back for a missing or draft episode', async () => {
    api.getEpisode.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
    renderDetail();

    expect(await screen.findByText('episodes.detail.notFound')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'episodes.detail.back' })).toHaveAttribute('href', '/episodes');
  });
});
