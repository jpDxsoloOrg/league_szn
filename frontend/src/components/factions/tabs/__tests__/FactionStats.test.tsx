import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const {
  mockGetStats,
  mockSeasonsGetAll,
  mockChampionshipsGetAll,
  mockUseOutletContext,
} = vi.hoisted(() => ({
  mockGetStats: vi.fn(),
  mockSeasonsGetAll: vi.fn(),
  mockChampionshipsGetAll: vi.fn(),
  mockUseOutletContext: vi.fn(),
}));

vi.mock('../../../../services/api', () => ({
  factionsApi: { getStats: mockGetStats },
  seasonsApi: { getAll: mockSeasonsGetAll },
  championshipsApi: { getAll: mockChampionshipsGetAll },
}));

vi.mock('react-router-dom', async () => {
  const actual: typeof import('react-router-dom') = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useOutletContext: () => mockUseOutletContext(),
  };
});

const interpolatingT = (_key: string, fallback?: string, options?: Record<string, unknown>) => {
  let text = fallback ?? _key;
  if (options) {
    for (const [name, value] of Object.entries(options)) {
      text = text.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value));
    }
  }
  return text;
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: interpolatingT }),
}));

vi.mock('../FactionStats.css', () => ({}));

import FactionStats from '../FactionStats';

const baseFaction = () => ({
  stableId: 'f1',
  name: 'The Brood',
  leaderId: 'leader',
  leaderName: 'Edge',
  memberIds: ['leader', 'm1'],
  status: 'active',
  wins: 12,
  losses: 4,
  draws: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  imageUrl: '/img/brood.png',
  members: [],
  standings: {
    winPercentage: 75,
    recentForm: ['W', 'W'],
    currentStreak: { type: 'W', count: 3 },
  },
  headToHead: [],
  matchTypeRecords: [],
  recentMatches: [],
});

const baseStats = (overrides: Record<string, unknown> = {}) => ({
  factionId: 'f1',
  factionName: 'The Brood',
  seasonId: null,
  totals: {
    wins: 12,
    losses: 4,
    draws: 1,
    winPercentage: 70.6,
    matchCount: 17,
    recentForm: ['W', 'W', 'L', 'W', 'W'],
    currentStreak: { type: 'W', count: 3 },
  },
  members: [
    {
      playerId: 'leader',
      playerName: 'Edge P',
      wrestlerName: 'Edge',
      wins: 8,
      losses: 1,
      draws: 0,
      winPercentage: 88.9,
      recentForm: ['W', 'W', 'W'],
      currentStreak: { type: 'W', count: 4 },
    },
    {
      playerId: 'm1',
      playerName: 'Christian P',
      wrestlerName: 'Christian',
      wins: 4,
      losses: 3,
      draws: 1,
      winPercentage: 50,
      recentForm: ['L', 'W'],
      currentStreak: { type: 'L', count: 1 },
    },
  ],
  matchTypeBreakdown: [
    { matchFormat: 'singles', wins: 8, losses: 2, draws: 1 },
    { matchFormat: 'tag', wins: 4, losses: 2, draws: 0 },
  ],
  headToHead: [
    { factionId: 'op1', factionName: 'Evolution', wins: 3, losses: 1, draws: 0 },
    { factionId: 'op2', factionName: 'D-X', wins: 2, losses: 2, draws: 0 },
  ],
  ...overrides,
});

function renderTab() {
  return render(
    <MemoryRouter>
      <FactionStats />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseOutletContext.mockReturnValue({ faction: baseFaction() });
  mockGetStats.mockResolvedValue(baseStats());
  mockSeasonsGetAll.mockResolvedValue([
    { seasonId: 's1', name: 'Season 1', startDate: '2025-01-01', status: 'completed', createdAt: '2025-01-01', updatedAt: '2025-12-31' },
    { seasonId: 's2', name: 'Season 2', startDate: '2026-01-01', status: 'active', createdAt: '2026-01-01', updatedAt: '2026-04-01' },
  ]);
  mockChampionshipsGetAll.mockResolvedValue([
    { championshipId: 'c1', name: 'World', type: 'singles', currentChampion: 'leader', isActive: true, createdAt: '2026-01-01' },
    { championshipId: 'c2', name: 'Tag', type: 'tag', currentChampion: ['leader', 'm1'], isActive: true, createdAt: '2026-02-01' },
    { championshipId: 'c3', name: 'Other', type: 'singles', currentChampion: 'outsider', isActive: true, createdAt: '2026-03-01' },
  ]);
});

describe('FactionStats tab (FAC-13)', () => {
  it('renders all four KPI tiles with values from getStats', async () => {
    renderTab();

    expect(await screen.findByRole('heading', { name: 'Total Wins' })).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // total wins
    expect(screen.getByRole('heading', { name: 'Win %' })).toBeInTheDocument();
    expect(screen.getByText('70.6%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Title Reigns' })).toBeInTheDocument();
    // 2 championships have currentChampion in memberIds (c1 + c2)
    await waitFor(() => {
      const counts = screen.getAllByText('2');
      expect(counts.length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('heading', { name: 'Heat Score' })).toBeInTheDocument();
    expect(screen.getByLabelText('Heat: 3 of 5')).toBeInTheDocument();
  });

  it('switches the segmented control to a season and refetches with the seasonId', async () => {
    // Vary the mock by season so we can detect the switch took effect.
    mockGetStats.mockImplementation(async (_factionId: string, opts?: { seasonId?: string }) => {
      if (opts?.seasonId === 's2') {
        return baseStats({
          seasonId: 's2',
          totals: {
            wins: 5,
            losses: 2,
            draws: 0,
            winPercentage: 71.4,
            matchCount: 7,
            recentForm: ['W'],
            currentStreak: { type: 'W', count: 1 },
          },
        });
      }
      return baseStats();
    });

    renderTab();
    await screen.findByText('70.6%'); // initial render done

    await userEvent.click(screen.getByRole('tab', { name: 'Season 2' }));

    await waitFor(() => {
      expect(mockGetStats).toHaveBeenCalledWith(
        'f1',
        { seasonId: 's2' },
        expect.anything(),
      );
    });
    expect(await screen.findByText('71.4%')).toBeInTheDocument();
  });

  it('reorders the H2H section when the comparison dropdown changes', async () => {
    // Disable season prefetch so the H2H card renders deterministically.
    mockSeasonsGetAll.mockResolvedValue([]);
    renderTab();
    await screen.findByText('70.6%');

    // Within the H2H card only — opponent names also appear in the dropdown.
    const h2hCard = screen.getByRole('heading', { name: 'vs Other Factions' }).closest('section')!;
    const firstRowBefore = h2hCard.querySelector('.faction-stats__h2h-row');
    expect(firstRowBefore?.textContent).toContain('Evolution');

    await userEvent.selectOptions(screen.getByLabelText('Compare against'), 'op2');

    const firstRowAfter = h2hCard.querySelector('.faction-stats__h2h-row');
    expect(firstRowAfter?.textContent).toContain('D-X');
    expect(firstRowAfter?.className).toContain('faction-stats__h2h-row--focus');
  });

  it('renders empty-state cards when there are no completed matches', async () => {
    mockGetStats.mockResolvedValue(
      baseStats({
        totals: {
          wins: 0,
          losses: 0,
          draws: 0,
          winPercentage: 0,
          matchCount: 0,
          recentForm: [],
          currentStreak: { type: 'W', count: 0 },
        },
        members: [],
        matchTypeBreakdown: [],
        headToHead: [],
      }),
    );

    renderTab();

    expect(await screen.findByText('No completed matches yet.')).toBeInTheDocument();
    expect(screen.getByText('No outcomes to distribute yet.')).toBeInTheDocument();
    expect(screen.getByText('No member stats yet.')).toBeInTheDocument();
    expect(screen.getByText('No cross-faction matches yet.')).toBeInTheDocument();
  });
});
