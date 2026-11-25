import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { PlayerBuildView } from '../../../services/api/builds.api';

const { mockGetPlayerBuild } = vi.hoisted(() => ({ mockGetPlayerBuild: vi.fn() }));

vi.mock('../../../services/api/builds.api', () => ({
  buildsApi: { getPlayerBuild: mockGetPlayerBuild },
}));

const stableT = (key: string, options?: Record<string, unknown>) =>
  (options ? `${key} ${Object.values(options).join(' ')}` : key);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

import BuildCard from '../BuildCard';

function buildView(overrides: Partial<PlayerBuildView> = {}): PlayerBuildView {
  return {
    playerId: 'p1',
    isDefault: false,
    build: {
      style: 'powerhouse',
      specialty: 'hardcore',
      stats: { strikes: 60, grapple: 70, agility: 45, endurance: 55 },
      updatedAt: '2026-11-20T00:00:00.000Z',
    },
    moves: {
      signatures: [{ gameName: 'Spear', customName: '', level: 3 }],
      finishers: [{ gameName: 'Jackhammer', customName: 'The Hammer', level: 2 }],
    },
    budget: { cost: 90, budget: 100, remaining: 10, overBudget: false },
    effective: {
      style: 'powerhouse',
      specialty: 'hardcore',
      stats: { strikes: 60, grapple: 78, agility: 45, endurance: 55 },
      spentStats: { strikes: 60, grapple: 70, agility: 45, endurance: 55 },
      signatureLevels: [3],
      finisherLevels: [2],
      scaled: false,
      status: { cost: 90, budget: 100, remaining: 10, overBudget: false },
    },
    rulesVersion: 1,
    ...overrides,
  };
}

describe('BuildCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the style, the specialty, the stats with the style bonus and the move levels', async () => {
    mockGetPlayerBuild.mockResolvedValue(buildView());
    render(<BuildCard playerId="p1" />);

    expect(await screen.findByTestId('build-card')).toBeInTheDocument();
    expect(mockGetPlayerBuild).toHaveBeenCalledWith('p1', expect.any(AbortSignal));
    expect(screen.getByTestId('style-badge')).toHaveTextContent('builds.styles.powerhouse');
    expect(screen.getByTestId('specialty-chip')).toHaveTextContent('builds.specialist simCategories.hardcore');

    // Effective value, with the 8-point style bonus marked on grapple only.
    const grapple = screen.getByTestId('stat-bar-grapple');
    expect(grapple).toHaveTextContent('78');
    expect(grapple).toHaveTextContent('builds.styleBonus 8');
    expect(screen.getByRole('progressbar', { name: 'builds.stats.grapple' })).toHaveAttribute('value', '78');
    expect(screen.getByTestId('stat-bar-strikes')).not.toHaveTextContent('builds.styleBonus');

    expect(screen.getByText('builds.moveLevel 3')).toBeInTheDocument();
    expect(screen.getByText('builds.moveLevel 2')).toBeInTheDocument();
    expect(screen.getByText('The Hammer')).toBeInTheDocument();
  });

  it('shows the levels the sim uses when the build was scaled down', async () => {
    const view = buildView();
    view.effective = { ...view.effective, signatureLevels: [2], finisherLevels: [1], scaled: true };
    mockGetPlayerBuild.mockResolvedValue(view);
    render(<BuildCard playerId="p1" />);

    expect(await screen.findByText('builds.moveLevel 2')).toBeInTheDocument();
    expect(screen.getByText('builds.moveLevel 1')).toBeInTheDocument();
    expect(screen.queryByText('builds.moveLevel 3')).not.toBeInTheDocument();
  });

  it('leaves out the specialty chip when there is none', async () => {
    const view = buildView();
    view.build = { ...view.build, specialty: undefined };
    mockGetPlayerBuild.mockResolvedValue(view);
    render(<BuildCard playerId="p1" />);

    expect(await screen.findByTestId('build-card')).toBeInTheDocument();
    expect(screen.queryByTestId('specialty-chip')).not.toBeInTheDocument();
  });

  it('shows no win odds or sim results', async () => {
    mockGetPlayerBuild.mockResolvedValue(buildView());
    render(<BuildCard playerId="p1" />);

    const card = await screen.findByTestId('build-card');
    expect(card).not.toHaveTextContent(/odds|%|chance/i);
  });

  it('hides a default build on someone else\'s profile', async () => {
    mockGetPlayerBuild.mockResolvedValue(buildView({ isDefault: true }));
    const { container } = render(<BuildCard playerId="p1" />);

    await waitFor(() => expect(mockGetPlayerBuild).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('asks the owner to set up a default build', async () => {
    mockGetPlayerBuild.mockResolvedValue(buildView({ isDefault: true }));
    render(<BuildCard playerId="p1" isOwnProfile setupAction={<button type="button">Open editor</button>} />);

    expect(await screen.findByTestId('build-card-setup')).toHaveTextContent('builds.card.setupTitle');
    expect(screen.getByRole('button', { name: 'Open editor' })).toBeInTheDocument();
    expect(screen.queryByTestId('stat-bar-grapple')).not.toBeInTheDocument();
  });

  it('renders nothing when the build cannot be read', async () => {
    mockGetPlayerBuild.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
    const { container } = render(<BuildCard playerId="p1" isOwnProfile />);

    await waitFor(() => expect(mockGetPlayerBuild).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
