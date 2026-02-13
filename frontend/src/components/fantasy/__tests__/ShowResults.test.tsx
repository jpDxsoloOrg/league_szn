import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockEventsApi, mockFantasyApi, mockDivisionsApi } = vi.hoisted(() => ({
  mockEventsApi: { getById: vi.fn() },
  mockFantasyApi: { getWrestlerCosts: vi.fn(), getUserPicks: vi.fn() },
  mockDivisionsApi: { getAll: vi.fn() },
}));

vi.mock('../../../services/api', () => ({
  eventsApi: mockEventsApi,
  fantasyApi: mockFantasyApi,
  divisionsApi: mockDivisionsApi,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ eventId: 'evt-1' }),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

import ShowResults from '../ShowResults';
import type { EventWithMatches } from '../../../types/event';
import type { WrestlerWithCost, FantasyPicks } from '../../../types/fantasy';
import type { Division } from '../../../types';

// --- Test data ---
const mockDivisions: Division[] = [
  { divisionId: 'div-1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockWrestlers: WrestlerWithCost[] = [
  {
    playerId: 'p1', name: 'John', currentWrestler: 'The Rock', divisionId: 'div-1',
    currentCost: 150, baseCost: 100, costTrend: 'up', winRate30Days: 80, recentRecord: '5-1',
  },
  {
    playerId: 'p2', name: 'Steve', currentWrestler: 'Stone Cold', divisionId: 'div-1',
    currentCost: 120, baseCost: 100, costTrend: 'stable', winRate30Days: 60, recentRecord: '3-3',
  },
];

const mockCompletedEvent: EventWithMatches = {
  eventId: 'evt-1', name: 'Royal Rumble', eventType: 'ppv', date: '2024-06-15T19:00:00Z',
  status: 'completed', matchCards: [],
  createdAt: '2024-01-01', updatedAt: '2024-06-15',
  enrichedMatches: [
    {
      position: 1, matchId: 'm1', designation: 'main-event',
      matchData: {
        matchId: 'm1', matchType: 'Singles', participants: [
          { playerId: 'p1', playerName: 'John', wrestlerName: 'The Rock' },
          { playerId: 'p2', playerName: 'Steve', wrestlerName: 'Stone Cold' },
        ],
        winners: ['p1'], losers: ['p2'], isChampionship: true,
        championshipName: 'World Heavyweight Championship', status: 'completed',
      },
    },
  ],
};

const mockUserPicks: FantasyPicks = {
  eventId: 'evt-1', fantasyUserId: 'user-1',
  picks: { 'div-1': ['p1'] },
  totalSpent: 150, pointsEarned: 25,
  breakdown: {
    p1: { points: 25, basePoints: 10, multipliers: ['Win', 'Championship +5'], matchId: 'm1', reason: 'Won Singles match' },
  },
  createdAt: '2024-01-01', updatedAt: '2024-06-15',
};

function renderComponent() {
  return render(<BrowserRouter><ShowResults /></BrowserRouter>);
}

describe('ShowResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventsApi.getById.mockResolvedValue(mockCompletedEvent);
    mockFantasyApi.getWrestlerCosts.mockResolvedValue(mockWrestlers);
    mockDivisionsApi.getAll.mockResolvedValue(mockDivisions);
    mockFantasyApi.getUserPicks.mockResolvedValue(mockUserPicks);
  });

  it('renders event results with event name, date, and total points earned', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Royal Rumble')).toBeInTheDocument();
    });

    // Total points (+25 appears in header and in picks breakdown)
    const pointsElements = screen.getAllByText('+25');
    expect(pointsElements.length).toBeGreaterThanOrEqual(1);

    // Match type displayed
    expect(screen.getByText('Singles')).toBeInTheDocument();

    // Championship badge
    expect(screen.getByText('World Heavyweight Championship')).toBeInTheDocument();
  });

  it('shows points breakdown per wrestler with base points and bonuses', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Royal Rumble')).toBeInTheDocument();
    });

    // Points breakdown section
    expect(screen.getByText('fantasy.results.pointsBreakdown')).toBeInTheDocument();

    // Wrestler name in breakdown (appears in picks summary + match results + breakdown)
    expect(screen.getAllByText('The Rock').length).toBeGreaterThanOrEqual(1);

    // Base points (10) and total (25) appear in breakdown table
    const tens = screen.getAllByText('10');
    expect(tens.length).toBeGreaterThanOrEqual(1);
    const twentyFives = screen.getAllByText('25');
    expect(twentyFives.length).toBeGreaterThanOrEqual(1);
  });

  it('shows error state when event is not found', async () => {
    mockEventsApi.getById.mockRejectedValue(new Error('Not found'));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.results.showNotFound')).toBeInTheDocument();
    });

    expect(screen.getByText('fantasy.results.backToDashboard')).toBeInTheDocument();
  });

  it('shows not-complete state for upcoming events', async () => {
    mockEventsApi.getById.mockResolvedValue({
      ...mockCompletedEvent,
      status: 'upcoming',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.results.showNotComplete')).toBeInTheDocument();
    });
  });
});
