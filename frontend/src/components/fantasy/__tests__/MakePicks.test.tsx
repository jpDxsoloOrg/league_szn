import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockFantasyApi, mockEventsApi, mockDivisionsApi, mockNavigate } = vi.hoisted(() => ({
  mockFantasyApi: {
    getWrestlerCosts: vi.fn(),
    getConfig: vi.fn(),
    getUserPicks: vi.fn(),
    submitPicks: vi.fn(),
    clearPicks: vi.fn(),
  },
  mockEventsApi: { getById: vi.fn() },
  mockDivisionsApi: { getAll: vi.fn() },
  mockNavigate: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  fantasyApi: mockFantasyApi,
  eventsApi: mockEventsApi,
  divisionsApi: mockDivisionsApi,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ eventId: 'evt-1' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => {
    if (opts) return `${key}:${JSON.stringify(opts)}`;
    return key;
  }}),
}));

import MakePicks from '../MakePicks';
import type { WrestlerWithCost, FantasyConfig } from '../../../types/fantasy';
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

const mockEvent = {
  eventId: 'evt-1', name: 'Royal Rumble', eventType: 'ppv' as const, date: '2024-06-15',
  status: 'upcoming' as const, matchCards: [], fantasyBudget: 500, fantasyPicksPerDivision: 2,
  createdAt: '2024-01-01', updatedAt: '2024-01-01',
};

const makeWrestler = (id: string, name: string, divisionId: string, cost: number): WrestlerWithCost => ({
  playerId: id, name: `Player ${id}`, currentWrestler: name,
  divisionId, currentCost: cost, baseCost: 100, costTrend: 'stable',
  winRate30Days: 50, recentRecord: '3-3',
});

const mockWrestlers: WrestlerWithCost[] = [
  makeWrestler('p1', 'The Rock', 'div-1', 150),
  makeWrestler('p2', 'Stone Cold', 'div-1', 120),
  makeWrestler('p3', 'Triple H', 'div-1', 200),
  makeWrestler('p4', 'Becky Lynch', 'div-2', 130),
  makeWrestler('p5', 'Charlotte', 'div-2', 110),
];

function renderComponent() {
  return render(<BrowserRouter><MakePicks /></BrowserRouter>);
}

describe('MakePicks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventsApi.getById.mockResolvedValue(mockEvent);
    mockDivisionsApi.getAll.mockResolvedValue(mockDivisions);
    mockFantasyApi.getWrestlerCosts.mockResolvedValue(mockWrestlers);
    mockFantasyApi.getConfig.mockResolvedValue(mockConfig);
    mockFantasyApi.getUserPicks.mockRejectedValue(new Error('No picks'));
  });

  it('renders division-based picker with division tabs and wrestler cards', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.picks.title')).toBeInTheDocument();
    });

    // Event name
    expect(screen.getByText('Royal Rumble')).toBeInTheDocument();
    // Division tabs and division headers both show names
    const rawElements = screen.getAllByText('Raw');
    expect(rawElements.length).toBeGreaterThanOrEqual(1);
    const sdElements = screen.getAllByText('SmackDown');
    expect(sdElements.length).toBeGreaterThanOrEqual(1);
    // Picks count displays (0/2 for each)
    const picksCounts = screen.getAllByText('0/2');
    expect(picksCounts.length).toBe(2);
    // Wrestler names visible in first (active) division
    expect(screen.getByText('The Rock')).toBeInTheDocument();
    expect(screen.getByText('Stone Cold')).toBeInTheDocument();
    // Wrestler costs displayed
    expect(screen.getByText('$150')).toBeInTheDocument();
    expect(screen.getByText('$120')).toBeInTheDocument();
  });

  it('enforces budget constraint by disabling unaffordable wrestlers', async () => {
    const user = userEvent.setup();
    // Budget = 260. After picking Rock ($150), remaining = $110.
    // Triple H ($200) costs more than remaining, so its card becomes disabled.
    mockEventsApi.getById.mockResolvedValue({ ...mockEvent, fantasyBudget: 260 });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('The Rock')).toBeInTheDocument();
    });

    // Find and select The Rock's card
    const rockCard = screen.getByText('The Rock').closest('[role="button"]')!;
    expect(rockCard).toHaveAttribute('aria-disabled', 'false');
    await user.click(rockCard);

    // After selecting Rock, remaining budget = $110
    // Triple H ($200) should be disabled because it costs more than remaining
    await waitFor(() => {
      const triplehCard = screen.getByText('Triple H').closest('[role="button"]')!;
      expect(triplehCard).toHaveAttribute('aria-disabled', 'true');
    });

    // Stone Cold ($120) is also over remaining $110 — should be disabled too
    const coldCard = screen.getByText('Stone Cold').closest('[role="button"]')!;
    expect(coldCard).toHaveAttribute('aria-disabled', 'true');
  });

  it('enforces picks-per-division limit by disabling remaining cards when maxed', async () => {
    const user = userEvent.setup();
    // picksPerDivision = 2; select 2 wrestlers, then third should be disabled
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('The Rock')).toBeInTheDocument();
    });

    // Select Rock and Stone Cold (2 picks, which is the max)
    const rockCard = screen.getByText('The Rock').closest('[role="button"]')!;
    const coldCard = screen.getByText('Stone Cold').closest('[role="button"]')!;
    await user.click(rockCard);
    await user.click(coldCard);

    // Triple H should now be disabled (division maxed)
    await waitFor(() => {
      const triplehCard = screen.getByText('Triple H').closest('[role="button"]')!;
      expect(triplehCard).toHaveAttribute('aria-disabled', 'true');
    });

    // Division tab should show "maxed" indicator (2/2)
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  it('submits picks via API and shows success message', async () => {
    const user = userEvent.setup();
    mockFantasyApi.submitPicks.mockResolvedValue({
      eventId: 'evt-1', fantasyUserId: 'user-1',
      picks: { 'div-1': ['p1'] }, totalSpent: 150,
      createdAt: '2024-01-01', updatedAt: '2024-01-01',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('The Rock')).toBeInTheDocument();
    });

    // Select a wrestler via its WrestlerCard
    const rockCard = screen.getByText('The Rock').closest('[role="button"]')!;
    await user.click(rockCard);

    // Submit
    const submitBtn = screen.getByText('fantasy.picks.submitPicks');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockFantasyApi.submitPicks).toHaveBeenCalledWith('evt-1', expect.any(Object));
    });

    await waitFor(() => {
      const successAlert = screen.queryAllByRole('alert').find(
        el => el.textContent?.includes('fantasy.picks.submitSuccess')
      );
      expect(successAlert).toBeTruthy();
    });
  });

  it('clears all picks via API and resets local state', async () => {
    const user = userEvent.setup();
    mockFantasyApi.clearPicks.mockResolvedValue(undefined);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('The Rock')).toBeInTheDocument();
    });

    // Select a wrestler first
    const rockCard = screen.getByText('The Rock').closest('[role="button"]')!;
    await user.click(rockCard);

    // Click clear all
    const clearBtn = screen.getByText('fantasy.picks.clearAll');
    await user.click(clearBtn);

    await waitFor(() => {
      expect(mockFantasyApi.clearPicks).toHaveBeenCalledWith('evt-1');
    });

    // All counts should be back to 0/2
    await waitFor(() => {
      const picksCounts = screen.getAllByText('0/2');
      expect(picksCounts.length).toBe(2);
    });
  });

  it('shows wrestler costs in each wrestler card', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.picks.title')).toBeInTheDocument();
    });

    // All div-1 wrestler costs visible (active tab)
    expect(screen.getByText('$150')).toBeInTheDocument();
    expect(screen.getByText('$120')).toBeInTheDocument();
    expect(screen.getByText('$200')).toBeInTheDocument();
  });
});
