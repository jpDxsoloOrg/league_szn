import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// --- Hoisted mocks ---
const { mockGetAllChampionships, mockGetAllDivisions, mockGetForChampionship } = vi.hoisted(() => ({
  mockGetAllChampionships: vi.fn(),
  mockGetAllDivisions: vi.fn(),
  mockGetForChampionship: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  championshipsApi: { getAll: mockGetAllChampionships },
  divisionsApi: { getAll: mockGetAllDivisions },
  contendersApi: { getForChampionship: mockGetForChampionship },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
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

  it('renders championship selector tabs grouped by division', async () => {
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);
    mockGetForChampionship.mockResolvedValue(mockContenderData);

    render(<ContenderRankings />);

    await waitFor(() => {
      expect(screen.getByText('Contender Rankings')).toBeInTheDocument();
    });

    // Division labels shown (since multiple groups)
    expect(screen.getByText('Raw')).toBeInTheDocument();
    expect(screen.getByText('SmackDown')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();

    // Championship tab buttons
    expect(screen.getByText('World Heavyweight')).toBeInTheDocument();
    expect(screen.getByText('Universal Championship')).toBeInTheDocument();
    expect(screen.getByText('Intercontinental')).toBeInTheDocument();
  });

  it('displays current champion card with default image fallback', async () => {
    mockGetAllChampionships.mockResolvedValue(mockChampionships);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);
    mockGetForChampionship.mockResolvedValue(mockContenderData);

    render(<ContenderRankings />);

    await waitFor(() => {
      expect(screen.getByText('Current Champion')).toBeInTheDocument();
    });

    // Champion card shows wrestler and player name
    const championCard = document.querySelector('.champion-card');
    expect(championCard).toBeTruthy();
    expect(championCard).toHaveTextContent('The Champ');
    expect(championCard).toHaveTextContent('John Cena');

    // Missing imageUrl should use default wrestler image
    const championImage = championCard!.querySelector('img');
    expect(championImage).toBeTruthy();
    expect(championImage).toHaveAttribute('src', '/images/placeholders/wrestler-default.svg');
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
    const upBadge = document.querySelector('.movement-badge.up');
    expect(upBadge).toBeTruthy();
    expect(upBadge).toHaveTextContent('1');

    const downBadge = document.querySelector('.movement-badge.down');
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
});
