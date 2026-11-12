import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockGetAllChampionships, mockGetAllDivisions, mockGetForChampionship, mockGetAllPlayers } = vi.hoisted(() => ({
  mockGetAllChampionships: vi.fn(),
  mockGetAllDivisions: vi.fn(),
  mockGetForChampionship: vi.fn(),
  mockGetAllPlayers: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  championshipsApi: { getAll: mockGetAllChampionships },
  divisionsApi: { getAll: mockGetAllDivisions },
  contendersApi: { getForChampionship: mockGetForChampionship },
  playersApi: { getAll: mockGetAllPlayers },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'contenders.title': 'Contender Rankings',
        'contenders.subtitle': 'Who deserves the next title shot?',
        'contenders.currentChampion': 'Current Champion',
        'contenders.rankings': 'Rankings',
        'contenders.noData': 'No active championships found.',
        'contenders.noContenders': 'No contenders ranked yet.',
        'contenders.lastCalculated': 'Last calculated',
        'contenders.topContender': '#1 Contender',
        'contenders.score': 'Score',
        'contenders.winRate': 'Win Rate',
        'contenders.streak': 'Streak',
        'contenders.new': 'NEW',
        'contenders.openDivision': 'Open',
        'contenders.selectChampionship': 'Championship',
        'contenders.tagTeam.noContenders': 'No eligible tag teams yet',
        'contenders.tagTeam.currentChampions': 'Current Champions',
        'common.loading': 'Loading...',
      };
      if (key === 'contenders.noContendersHint') {
        return `Players need at least ${opts?.minMatches || 3} matches`;
      }
      return map[key] || key;
    },
  }),
}));

vi.mock('../ContenderRankings.css', () => ({}));
vi.mock('../ContenderCard.css', () => ({}));
vi.mock('../ContenderMembers.css', () => ({}));
vi.mock('../../PlayerHoverCard.css', () => ({}));

import { MemoryRouter } from 'react-router-dom';
import ContenderRankings from '../ContenderRankings';

// --- Test data ---
const mockDivisions = [
  { divisionId: 'div1', name: 'Raw', description: '', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'div2', name: 'SmackDown', description: '', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockChampionships = [
  {
    championshipId: 'ch1',
    name: 'World Heavyweight',
    type: 'singles' as const,
    divisionId: 'div1',
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    championshipId: 'ch2',
    name: 'Universal Championship',
    type: 'singles' as const,
    divisionId: 'div2',
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    championshipId: 'ch3',
    name: 'Intercontinental',
    type: 'singles' as const,
    isActive: true,
    createdAt: '2024-01-01',
  },
];

const mockContenderData = {
  championshipId: 'ch1',
  championshipName: 'World Heavyweight',
  divisionId: 'div1',
  currentChampion: {
    playerId: 'p1',
    playerName: 'John Cena',
    wrestlerName: 'The Champ',
    imageUrl: undefined,
  },
  contenders: [
    {
      championshipId: 'ch1',
      playerId: 'p2',
      playerName: 'The Rock',
      wrestlerName: 'The Great One',
      rank: 1,
      rankingScore: 85.5,
      winPercentage: 72.0,
      currentStreak: 5,
      qualityScore: 80,
      recencyScore: 90,
      matchesInPeriod: 10,
      winsInPeriod: 7,
      previousRank: 2,
      peakRank: 1,
      weeksAtTop: 3,
      calculatedAt: '2024-06-01T12:00:00Z',
      updatedAt: '2024-06-01T12:00:00Z',
      movement: 1,
      isNew: false,
    },
    {
      championshipId: 'ch1',
      playerId: 'p3',
      playerName: 'Undertaker',
      wrestlerName: 'The Deadman',
      rank: 2,
      rankingScore: 75.2,
      winPercentage: 65.0,
      currentStreak: -2,
      qualityScore: 70,
      recencyScore: 80,
      matchesInPeriod: 8,
      winsInPeriod: 5,
      peakRank: 1,
      weeksAtTop: 1,
      calculatedAt: '2024-06-01T12:00:00Z',
      updatedAt: '2024-06-01T12:00:00Z',
      movement: -1,
      isNew: false,
    },
  ],
  calculatedAt: '2024-06-01T12:00:00Z',
};

describe('ContenderRankings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists titles in a selector, prefixed by division', async () => {
    const user = userEvent.setup();
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);
    mockGetForChampionship.mockResolvedValue(mockContenderData);

    render(<ContenderRankings />);

    const selector = await screen.findByRole('combobox', { name: 'Championship' });
    expect(selector).toHaveTextContent('Raw: World Heavyweight');

    await user.click(selector);
    expect(await screen.findByRole('option', { name: 'SmackDown: Universal Championship' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Open: Intercontinental' }));

    await waitFor(() => {
      expect(mockGetForChampionship).toHaveBeenCalledWith('ch3', expect.any(AbortSignal));
    });
  });

  it('displays the current champion with an initials fallback', async () => {
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);
    mockGetForChampionship.mockResolvedValue(mockContenderData);

    render(<ContenderRankings />);

    const champion = await screen.findByRole('region', { name: 'Current Champion' });
    expect(champion).toHaveTextContent('The Champ');
    expect(champion).toHaveTextContent('John Cena');
    expect(screen.getByRole('img', { name: 'The Champ' })).toHaveTextContent('TC');
  });

  it('reports a failed rankings load instead of an empty list', async () => {
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);
    mockGetForChampionship.mockRejectedValue(new Error('Nope'));

    render(<ContenderRankings />);

    expect(await screen.findByText('contenders.rankingsLoadFailed')).toBeInTheDocument();
    expect(screen.queryByText('No contenders ranked yet.')).not.toBeInTheDocument();
  });

  it('shows ranked contenders with movement indicators and stats', async () => {
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);
    mockGetForChampionship.mockResolvedValue(mockContenderData);

    render(<ContenderRankings />);

    await waitFor(() => {
      expect(screen.getByText('Rankings')).toBeInTheDocument();
    });

    // Contender names
    expect(screen.getByText('The Great One')).toBeInTheDocument();
    expect(screen.getByText('The Deadman')).toBeInTheDocument();

    // Movement indicators -- use CSS class selectors for specificity
    const upBadge = document.querySelector('.contender-row__move--up');
    expect(upBadge).toBeTruthy();
    expect(upBadge).toHaveTextContent('1');

    const downBadge = document.querySelector('.contender-row__move--down');
    expect(downBadge).toBeTruthy();
    expect(downBadge).toHaveTextContent('1');

    // Ranking scores
    expect(screen.getByText('85.5')).toBeInTheDocument();
    expect(screen.getByText('75.2')).toBeInTheDocument();

    // Win percentages
    expect(screen.getByText('72.0%')).toBeInTheDocument();
    expect(screen.getByText('65.0%')).toBeInTheDocument();

    // Top contender badge for rank 1
    expect(screen.getByText('#1 Contender')).toBeInTheDocument();
  });

  it('handles loading state while fetching data', async () => {
    mockGetAllChampionships.mockReturnValue(new Promise(() => {}));
    mockGetAllDivisions.mockReturnValue(new Promise(() => {}));

    render(<ContenderRankings />);

    expect(screen.getByRole('status', { name: 'Loading...' })).toBeInTheDocument();
  });

  it('shows empty state when no active championships exist', async () => {
    // Return no active championships (all inactive ones would be filtered)
    mockGetAllChampionships.mockResolvedValue([
      { ...mockChampionships[0], isActive: false },
    ]);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);

    render(<ContenderRankings />);

    await waitFor(() => {
      expect(screen.getByText('No active championships found.')).toBeInTheDocument();
    });
  });

  describe('tag titles', () => {
    const tagChampionship = {
      championshipId: 'tag1',
      name: 'Tag Team Championship',
      type: 'tag' as const,
      isActive: true,
      createdAt: '2024-01-01',
    };

    const member = (playerId: string, playerName: string, wrestlerName: string) => ({
      playerId, playerName, wrestlerName, imageUrl: null,
    });

    const tagRow = {
      championshipId: 'tag1',
      entityType: 'tagTeam' as const,
      playerId: 'tt1',
      tagTeamId: 'tt1',
      tagTeamName: 'The Usos',
      tagTeamImageUrl: null,
      tagTeamStatus: 'active' as const,
      members: [member('p2', 'Jey', 'Jey Uso'), member('p3', 'Jimmy', 'Jimmy Uso')],
      playerName: 'Jey & Jimmy',
      wrestlerName: 'The Usos',
      imageUrl: null,
      rank: 1,
      rankingScore: 90,
      winPercentage: 80,
      currentStreak: 4,
      qualityScore: 80,
      recencyScore: 80,
      matchesInPeriod: 10,
      winsInPeriod: 8,
      peakRank: 1,
      weeksAtTop: 1,
      calculatedAt: '2024-06-01T12:00:00Z',
      updatedAt: '2024-06-01T12:00:00Z',
      movement: 0,
      isNew: false,
    };

    const renderPage = () => render(<MemoryRouter><ContenderRankings /></MemoryRouter>);

    beforeEach(() => {
      mockGetAllChampionships.mockResolvedValue([tagChampionship]);
      mockGetAllDivisions.mockResolvedValue([]);
      mockGetAllPlayers.mockResolvedValue([]);
    });

    it('shows team cards and the champion team with both members', async () => {
      mockGetForChampionship.mockResolvedValue({
        championshipId: 'tag1',
        championshipName: 'Tag Team Championship',
        currentChampion: {
          type: 'tagTeam',
          tagTeamId: 'tt9',
          tagTeamName: 'New Day',
          tagTeamImageUrl: null,
          members: [member('p8', 'Kofi', 'Kofi Kingston'), member('p9', 'Woods', 'Xavier Woods')],
          playerName: 'Kofi & Woods',
          wrestlerName: 'New Day',
          imageUrl: null,
        },
        contenders: [tagRow],
        calculatedAt: null,
      });

      renderPage();

      const champion = await screen.findByRole('region', { name: 'Current Champions' });
      expect(champion).toHaveTextContent('New Day');
      expect(champion).toHaveTextContent('Kofi & Woods');
      expect(screen.getByRole('link', { name: 'New Day' })).toHaveAttribute('href', '/tag-teams/tt9');
      expect(screen.getByRole('img', { name: 'Kofi Kingston' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Xavier Woods' })).toBeInTheDocument();

      expect(screen.getByRole('link', { name: 'The Usos' })).toHaveAttribute('href', '/tag-teams/tt1');
      expect(screen.getByText('#1 Contender')).toBeInTheDocument();
      await waitFor(() => expect(mockGetAllPlayers).toHaveBeenCalled());
    });

    it('names the members when the holders are not a known team', async () => {
      mockGetForChampionship.mockResolvedValue({
        championshipId: 'tag1',
        championshipName: 'Tag Team Championship',
        currentChampion: {
          type: 'tagTeam',
          tagTeamId: null,
          tagTeamName: null,
          tagTeamImageUrl: null,
          members: [member('p8', 'Kofi', 'Kofi Kingston'), member('p4', 'Sami', 'Sami Zayn')],
          playerName: 'Kofi & Sami',
          wrestlerName: 'Kofi Kingston & Sami Zayn',
          imageUrl: null,
        },
        contenders: [],
        calculatedAt: null,
      });

      renderPage();

      const champion = await screen.findByRole('region', { name: 'Current Champions' });
      expect(champion).toHaveTextContent('Kofi Kingston & Sami Zayn');
      expect(champion).toHaveTextContent('Kofi & Sami');
      expect(within(champion).queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText('No eligible tag teams yet')).toBeInTheDocument();
    });
  });

  it('does not load players for a singles title', async () => {
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);
    mockGetForChampionship.mockResolvedValue(mockContenderData);

    render(<ContenderRankings />);

    await screen.findByText('The Great One');
    expect(mockGetAllPlayers).not.toHaveBeenCalled();
  });
});
