import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

const { mockGetMatchTypeLeaderboards } = vi.hoisted(() => ({
  mockGetMatchTypeLeaderboards: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  statisticsApi: { getMatchTypeLeaderboards: mockGetMatchTypeLeaderboards },
  seasonsApi: {
    getAll: vi.fn().mockResolvedValue([]),
  },
  matchTypesApi: {
    getAll: vi.fn().mockResolvedValue([
      { matchTypeId: 'mt-single', name: 'Single', createdAt: '', updatedAt: '' },
      { matchTypeId: 'mt-tag', name: 'Tag Team', createdAt: '', updatedAt: '' },
    ]),
  },
  stipulationsApi: {
    getAll: vi.fn().mockResolvedValue([
      { stipulationId: 'stip-cage', name: 'Steel Cage', createdAt: '', updatedAt: '' },
    ]),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const map: Record<string, string> = {
        'statistics.matchTypeLeaderboards.title': 'Match Type Leaderboards',
        'statistics.nav.playerStats': 'Player Stats',
        'statistics.nav.leaderboards': 'Leaderboards',
        'statistics.nav.records': 'Record Book',
        'statistics.labels.matchType': 'Match Type',
        'statistics.labels.stipulation': 'Stipulation',
        'statistics.matchTypeLeaderboards.noData': 'No match data available for this type yet.',
        'statistics.matchTypeLeaderboards.filteredBySimple': `Filtered by "${options?.filter || ''}".`,
        'common.all': 'All',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('../Leaderboards.css', () => ({}));
vi.mock('../SeasonSelector.css', () => ({}));

import MatchTypeLeaderboards from '../MatchTypeLeaderboards';

function renderComponent() {
  return render(
    <BrowserRouter>
      <MatchTypeLeaderboards />
    </BrowserRouter>
  );
}

describe('MatchTypeLeaderboards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders leaderboard entries for default all filters', async () => {
    mockGetMatchTypeLeaderboards.mockResolvedValue({
      leaderboard: [
        {
          playerId: 'p1',
          playerName: 'John Cena',
          wrestlerName: 'The Champ',
          wins: 5,
          losses: 1,
          draws: 0,
          matchesPlayed: 6,
          winPercentage: 83.3,
          rank: 1,
        },
      ],
      appliedFilters: {},
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Match Type Leaderboards')).toBeInTheDocument();
      expect(screen.getByText('John Cena')).toBeInTheDocument();
      expect(screen.getByText('83.3%')).toBeInTheDocument();
    });

    expect(mockGetMatchTypeLeaderboards).toHaveBeenCalledWith(
      { seasonId: undefined, matchTypeId: undefined, stipulationId: undefined },
      expect.any(AbortSignal)
    );
  });

  it('requests filtered leaderboard when selecting a match type', async () => {
    const user = userEvent.setup();
    mockGetMatchTypeLeaderboards
      .mockResolvedValueOnce({
        leaderboard: [
          {
            playerId: 'p1',
            playerName: 'John Cena',
            wrestlerName: 'The Champ',
            wins: 5,
            losses: 1,
            draws: 0,
            matchesPlayed: 6,
            winPercentage: 83.3,
            rank: 1,
          },
        ],
        appliedFilters: {},
      })
      .mockResolvedValueOnce({
        leaderboard: [],
        appliedFilters: { matchTypeId: 'mt-tag', matchTypeName: 'Tag Team' },
      });

    renderComponent();

    const select = await screen.findByLabelText('Match Type');
    await user.selectOptions(select, 'mt-tag');

    await waitFor(() => {
      expect(mockGetMatchTypeLeaderboards).toHaveBeenNthCalledWith(
        2,
        { seasonId: undefined, matchTypeId: 'mt-tag', stipulationId: undefined },
        expect.any(AbortSignal)
      );
      expect(screen.getByText('No match data available for this type yet.')).toBeInTheDocument();
    });
  });
});
