import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockGetMatchRatings, mockGetDirectory } = vi.hoisted(() => ({
  mockGetMatchRatings: vi.fn(),
  mockGetDirectory: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  statisticsApi: { getMatchRatings: mockGetMatchRatings },
  playersApi: { getDirectory: mockGetDirectory },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'common.vs': 'vs',
      'statistics.bestMatches.noData': 'No rated matches yet.',
      'statistics.bestMatches.unknownPlayer': 'Unknown player',
      'match.matchOfTheNightBadge': 'Match of the Night',
    }[key] ?? key),
  }),
}));

import BestMatches from '../BestMatches';

function renderComponent() {
  return render(
    <MemoryRouter>
      <BestMatches />
    </MemoryRouter>
  );
}

describe('BestMatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names participants from the directory, falling back to the player name', async () => {
    mockGetMatchRatings.mockResolvedValue({
      highestRatedMatches: [
        { matchId: 'm1', date: '2024-06-01', starRating: 4.5, ratingsCount: 3, matchOfTheNight: true, participants: ['p1', 'p2', 'gone'] },
      ],
    });
    mockGetDirectory.mockResolvedValue([
      { playerId: 'p1', name: 'John', currentWrestler: 'The Champ' },
      { playerId: 'p2', name: 'Dwayne', currentWrestler: null },
    ]);

    renderComponent();

    expect(await screen.findByText('The Champ vs Dwayne vs Unknown player')).toBeInTheDocument();
    expect(screen.getByText('Jun 1, 2024')).toBeInTheDocument();
    expect(screen.getByText('Match of the Night')).toBeInTheDocument();
  });

  it('shows the empty state when no matches are rated', async () => {
    mockGetMatchRatings.mockResolvedValue({ highestRatedMatches: [] });
    mockGetDirectory.mockResolvedValue([]);

    renderComponent();

    expect(await screen.findByText('No rated matches yet.')).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    mockGetMatchRatings.mockRejectedValue(new Error('Network error'));
    mockGetDirectory.mockResolvedValue([]);

    renderComponent();

    expect(await screen.findByRole('button', { name: 'common.retry' })).toBeInTheDocument();
  });
});
