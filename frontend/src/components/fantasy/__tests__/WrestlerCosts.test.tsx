import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockFantasyApi, mockDivisionsApi } = vi.hoisted(() => ({
  mockFantasyApi: {
    getWrestlerCosts: vi.fn(),
  },
  mockDivisionsApi: {
    getAll: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  fantasyApi: mockFantasyApi,
  divisionsApi: mockDivisionsApi,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import WrestlerCosts from '../WrestlerCosts';
import type { WrestlerWithCost } from '../../../types/fantasy';
import type { Division } from '../../../types';

// --- Test data ---
const mockDivisions: Division[] = [
  { divisionId: 'div-1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'div-2', name: 'SmackDown', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockWrestlers: WrestlerWithCost[] = [
  {
    playerId: 'p1', name: 'John', currentWrestler: 'The Rock', divisionId: 'div-1',
    currentCost: 180, baseCost: 100, costTrend: 'up', winRate30Days: 85, recentRecord: '6-1',
  },
  {
    playerId: 'p2', name: 'Steve', currentWrestler: 'Stone Cold', divisionId: 'div-1',
    currentCost: 120, baseCost: 100, costTrend: 'stable', winRate30Days: 55, recentRecord: '3-3',
  },
  {
    playerId: 'p3', name: 'Paul', currentWrestler: 'Triple H', divisionId: 'div-2',
    currentCost: 80, baseCost: 100, costTrend: 'down', winRate30Days: 30, recentRecord: '2-5',
  },
];

describe('WrestlerCosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFantasyApi.getWrestlerCosts.mockResolvedValue(mockWrestlers);
    mockDivisionsApi.getAll.mockResolvedValue(mockDivisions);
  });

  it('renders cost table with wrestler names, costs, trends, and win rates', async () => {
    render(<WrestlerCosts />);

    await waitFor(() => {
      expect(screen.getByText('The Rock')).toBeInTheDocument();
    });

    // Table header
    expect(screen.getByText('fantasy.costs.title')).toBeInTheDocument();

    // Wrestler names
    expect(screen.getByText('Stone Cold')).toBeInTheDocument();
    expect(screen.getByText('Triple H')).toBeInTheDocument();

    // Costs displayed
    expect(screen.getByText('$180')).toBeInTheDocument();
    expect(screen.getByText('$120')).toBeInTheDocument();
    expect(screen.getByText('$80')).toBeInTheDocument();

    // Base costs (all three have baseCost: 100, so multiple matches)
    const baseCostElements = screen.getAllByText('(base: $100)');
    expect(baseCostElements.length).toBe(3);

    // Trends: up arrow for Rock (+80), stable for Stone Cold (0), down for Triple H (-20)
    expect(screen.getByText(/\+80/)).toBeInTheDocument();
    expect(screen.getByText(/-20/)).toBeInTheDocument();

    // Win rates
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();

    // Recent records
    expect(screen.getByText('6-1')).toBeInTheDocument();
    expect(screen.getByText('3-3')).toBeInTheDocument();
    expect(screen.getByText('2-5')).toBeInTheDocument();

    // Division filter buttons (use getAllByText since division names also appear in table)
    expect(screen.getByText('common.all')).toBeInTheDocument();
    expect(screen.getAllByText('Raw').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('SmackDown').length).toBeGreaterThanOrEqual(1);
  });

  it('filters wrestlers by division when a filter button is clicked', async () => {
    const user = userEvent.setup();
    render(<WrestlerCosts />);

    await waitFor(() => {
      expect(screen.getByText('The Rock')).toBeInTheDocument();
    });

    // Select SmackDown from the division filter dropdown
    const divisionSelect = screen.getByRole('combobox');
    await user.selectOptions(divisionSelect, 'SmackDown');

    // Only SmackDown wrestlers visible
    expect(screen.getByText('Triple H')).toBeInTheDocument();
    expect(screen.queryByText('The Rock')).not.toBeInTheDocument();
    expect(screen.queryByText('Stone Cold')).not.toBeInTheDocument();
  });

  it('shows empty state when no wrestlers match the search/filter', async () => {
    const user = userEvent.setup();
    render(<WrestlerCosts />);

    await waitFor(() => {
      expect(screen.getByText('The Rock')).toBeInTheDocument();
    });

    // Search for nonexistent wrestler
    const searchInput = screen.getByPlaceholderText('fantasy.costs.searchPlaceholder');
    await user.type(searchInput, 'zzzzz');

    expect(screen.getByText('fantasy.costs.noResults')).toBeInTheDocument();
  });
});
