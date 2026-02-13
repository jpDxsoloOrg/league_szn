import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockFantasyApi, mockEventsApi, mockDivisionsApi } = vi.hoisted(() => ({
  mockFantasyApi: {
    getAllMyPicks: vi.fn(),
    getWrestlerCosts: vi.fn(),
    getConfig: vi.fn(),
    scoreCompletedEvents: vi.fn(),
  },
  mockEventsApi: { getAll: vi.fn() },
  mockDivisionsApi: { getAll: vi.fn() },
}));

vi.mock('../../../services/api', () => ({
  fantasyApi: mockFantasyApi,
  eventsApi: mockEventsApi,
  divisionsApi: mockDivisionsApi,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import FantasyDashboard from '../FantasyDashboard';
import type { LeagueEvent } from '../../../types/event';
import type { FantasyPicks, FantasyConfig, WrestlerWithCost } from '../../../types/fantasy';
import type { Division } from '../../../types';

// --- Test data ---
const mockConfig: FantasyConfig = {
  configKey: 'GLOBAL',
  defaultBudget: 500,
  defaultPicksPerDivision: 2,
  baseWinPoints: 10,
  championshipBonus: 5,
  titleWinBonus: 15,
  titleDefenseBonus: 10,
  costFluctuationEnabled: false,
  costChangePerWin: 10,
  costChangePerLoss: 5,
  costResetStrategy: 'reset',
  underdogMultiplier: 1.5,
  perfectPickBonus: 25,
  streakBonusThreshold: 3,
  streakBonusPoints: 5,
};

const mockDivisions: Division[] = [
  { divisionId: 'div-1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'div-2', name: 'SmackDown', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockWrestlers: WrestlerWithCost[] = [
  {
    playerId: 'p1', name: 'John', currentWrestler: 'The Rock', divisionId: 'div-1',
    currentCost: 150, baseCost: 100, costTrend: 'up', winRate30Days: 80, recentRecord: '4-1',
  },
];

const upcomingEvent: LeagueEvent = {
  eventId: 'evt-1', name: 'Royal Rumble', eventType: 'ppv', date: '2024-06-15',
  status: 'upcoming', matchCards: [{ position: 1, matchId: 'm1', designation: 'main-event' }],
  fantasyBudget: 600, fantasyPicksPerDivision: 3,
  createdAt: '2024-01-01', updatedAt: '2024-01-01',
};

const completedEvent: LeagueEvent = {
  eventId: 'evt-2', name: 'WrestleMania', eventType: 'ppv', date: '2024-04-01',
  status: 'completed', matchCards: [],
  createdAt: '2024-01-01', updatedAt: '2024-01-01',
};

const myPicks: FantasyPicks = {
  eventId: 'evt-1', fantasyUserId: 'user-1',
  picks: { 'div-1': ['p1'] },
  totalSpent: 150, pointsEarned: undefined,
  createdAt: '2024-01-01', updatedAt: '2024-01-01',
};

const scoredPicks: FantasyPicks = {
  eventId: 'evt-2', fantasyUserId: 'user-1',
  picks: { 'div-1': ['p1'] },
  totalSpent: 150, pointsEarned: 35,
  createdAt: '2024-01-01', updatedAt: '2024-01-01',
};

function renderComponent() {
  return render(<BrowserRouter><FantasyDashboard /></BrowserRouter>);
}

describe('FantasyDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventsApi.getAll.mockResolvedValue([upcomingEvent, completedEvent]);
    mockFantasyApi.getAllMyPicks.mockResolvedValue([myPicks, scoredPicks]);
    mockFantasyApi.getWrestlerCosts.mockResolvedValue(mockWrestlers);
    mockDivisionsApi.getAll.mockResolvedValue(mockDivisions);
    mockFantasyApi.getConfig.mockResolvedValue(mockConfig);
  });

  it('shows loading state during initial fetch', () => {
    mockEventsApi.getAll.mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders upcoming show card with event details', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.dashboard.upcomingShow')).toBeInTheDocument();
    });

    expect(screen.getByText('Royal Rumble')).toBeInTheDocument();
    expect(screen.getByText('fantasy.showStatus.open')).toBeInTheDocument();
    // Budget from event override
    expect(screen.getByText('$600')).toBeInTheDocument();
    // Picks per division from event override
    expect(screen.getByText('3')).toBeInTheDocument();
    // Match count
    expect(screen.getByText('1')).toBeInTheDocument();
    // Edit picks link (picks exist for this event)
    expect(screen.getByText('fantasy.dashboard.editPicks')).toBeInTheDocument();
  });

  it('shows current picks preview with division names and wrestler names', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.dashboard.yourPicks')).toBeInTheDocument();
    });

    // Division name resolved from mock divisions
    expect(screen.getByText('Raw')).toBeInTheDocument();
    // Wrestler name resolved from mock wrestlers
    expect(screen.getByText('The Rock')).toBeInTheDocument();
    // Budget spent/remaining
    expect(screen.getByText(/\$150/)).toBeInTheDocument();
  });

  it('displays stats and recent results', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.dashboard.yourStats')).toBeInTheDocument();
    });

    // Total points = 0 (unscored) + 35 (scored) = 35
    const pointValues = screen.getAllByText('35');
    expect(pointValues.length).toBeGreaterThanOrEqual(1);
    // Events participated = 2 picks total
    expect(screen.getByText('2')).toBeInTheDocument();
    // Recent results section with completed event
    expect(screen.getByText('fantasy.dashboard.recentResults')).toBeInTheDocument();
    expect(screen.getByText('WrestleMania')).toBeInTheDocument();
    expect(screen.getByText('+35')).toBeInTheDocument();
  });

  it('auto-scores unscored picks for completed events on mount', async () => {
    // The completed event (evt-2) has a pick with pointsEarned=undefined in myPicks
    // but the upstream mock returns scoredPicks (with points) for the initial fetch.
    // To test auto-scoring, we need an unscored pick for a completed event.
    const unscoredPick: FantasyPicks = {
      eventId: 'evt-2', fantasyUserId: 'user-1',
      picks: { 'div-1': ['p1'] },
      totalSpent: 150, pointsEarned: undefined,
      createdAt: '2024-01-01', updatedAt: '2024-01-01',
    };

    mockFantasyApi.getAllMyPicks
      .mockResolvedValueOnce([unscoredPick])    // initial fetch — unscored
      .mockResolvedValueOnce([scoredPicks]);     // re-fetch after scoring

    mockFantasyApi.scoreCompletedEvents.mockResolvedValue({
      message: 'Scored', scoredEventIds: ['evt-2'],
    });

    renderComponent();

    await waitFor(() => {
      expect(mockFantasyApi.scoreCompletedEvents).toHaveBeenCalled();
    });

    // Re-fetches picks after scoring
    expect(mockFantasyApi.getAllMyPicks).toHaveBeenCalledTimes(2);
  });
});
