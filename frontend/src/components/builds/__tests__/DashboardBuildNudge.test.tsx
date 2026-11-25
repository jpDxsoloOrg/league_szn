import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PlayerBuildView } from '../../../services/api/builds.api';

const { mockGetPlayerBuild, authState } = vi.hoisted(() => ({
  mockGetPlayerBuild: vi.fn(),
  authState: { isAuthenticated: true, isWrestler: true, playerId: 'p1' as string | null },
}));

vi.mock('../../../services/api/builds.api', () => ({ buildsApi: { getPlayerBuild: mockGetPlayerBuild } }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => authState }));

const stableT = (key: string, options?: Record<string, unknown>) =>
  (options ? `${key} ${Object.values(options).join(' ')}` : key);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

import DashboardBuildNudge from '../DashboardBuildNudge';

const stats = { strikes: 60, grapple: 40, agility: 40, endurance: 40 };

function view(budget: PlayerBuildView['budget'], specialty?: PlayerBuildView['build']['specialty']): PlayerBuildView {
  return {
    playerId: 'p1',
    isDefault: false,
    build: { style: 'striker', specialty, stats, updatedAt: 'x' },
    moves: { signatures: [], finishers: [] },
    budget,
    effective: {
      style: 'striker',
      specialty,
      stats,
      spentStats: stats,
      signatureLevels: [],
      finisherLevels: [],
      scaled: budget.overBudget,
      status: budget,
    },
    rulesVersion: 1,
  };
}

function renderNudge() {
  return render(
    <MemoryRouter>
      <DashboardBuildNudge />
    </MemoryRouter>,
  );
}

describe('DashboardBuildNudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isWrestler = true;
    authState.playerId = 'p1';
  });

  it('shows unspent points and a missing specialty, linking to the editor', async () => {
    mockGetPlayerBuild.mockResolvedValue(view({ cost: 20, budget: 100, remaining: 80, overBudget: false }));
    renderNudge();

    const nudge = await screen.findByTestId('build-nudge');
    expect(nudge).toHaveTextContent('builds.nudge.unspent 80');
    expect(nudge).toHaveTextContent('builds.nudge.pickSpecialty');
    expect(screen.getByRole('link', { name: 'builds.nudge.open' })).toHaveAttribute('href', '/profile');
  });

  it('shows an over-budget build', async () => {
    mockGetPlayerBuild.mockResolvedValue(view({ cost: 120, budget: 100, remaining: -20, overBudget: true }, 'hardcore'));
    renderNudge();

    const nudge = await screen.findByTestId('build-nudge');
    expect(nudge).toHaveTextContent('builds.nudge.overBudget 20');
    expect(nudge).not.toHaveTextContent('builds.nudge.unspent');
    expect(nudge).not.toHaveTextContent('builds.nudge.pickSpecialty');
  });

  it('renders nothing when the build is fully spent with a specialty', async () => {
    mockGetPlayerBuild.mockResolvedValue(view({ cost: 100, budget: 100, remaining: 0, overBudget: false }, 'hardcore'));
    renderNudge();

    await waitFor(() => expect(mockGetPlayerBuild).toHaveBeenCalled());
    expect(screen.queryByTestId('build-nudge')).not.toBeInTheDocument();
  });

  it('does not load for non-wrestlers', () => {
    authState.isWrestler = false;
    renderNudge();
    expect(mockGetPlayerBuild).not.toHaveBeenCalled();
  });
});
