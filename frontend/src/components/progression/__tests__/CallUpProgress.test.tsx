import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../../i18n';
import type { PlayerProgressionSummary } from '../../../types/progression';

const { mockProgressionApi, mockUseAuth } = vi.hoisted(() => ({
  mockProgressionApi: { getForPlayer: vi.fn() },
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  progressionApi: mockProgressionApi,
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

import CallUpProgress from '../CallUpProgress';
import DashboardCallUp from '../DashboardCallUp';

const ownerView: PlayerProgressionSummary = {
  trackId: 'track-yb',
  kind: 'callup',
  trackName: 'Young Boys Call-Up',
  progressPct: 62.5,
  consideration: false,
  computedAt: '2026-11-01T00:00:00.000Z',
  goals: [
    { goalId: 'matches', metric: 'matchesCompeted', threshold: 10, weight: 1, direction: 'atLeast', current: 10, met: true },
    {
      goalId: 'stars',
      metric: 'avgStarRating',
      threshold: 3,
      weight: 1,
      direction: 'atLeast',
      params: { minRatedMatches: 5 },
      current: null,
      met: false,
    },
    { goalId: 'wins', metric: 'wins', threshold: 5, weight: 1, direction: 'atLeast', current: 3, met: false },
  ],
};

const publicView: PlayerProgressionSummary = {
  trackId: ownerView.trackId,
  kind: ownerView.kind,
  trackName: ownerView.trackName,
  progressPct: ownerView.progressPct,
  consideration: false,
  computedAt: ownerView.computedAt,
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ isAuthenticated: true, isWrestler: true, playerId: 'p1' });
});

describe('CallUpProgress', () => {
  it('shows the bar and the goal checklist to the owner', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([ownerView]);
    render(<CallUpProgress playerId="p1" />);

    expect(await screen.findByRole('heading', { name: 'Road to the Main Roster' })).toBeInTheDocument();
    expect(mockProgressionApi.getForPlayer).toHaveBeenCalledWith('p1', expect.any(AbortSignal));
    expect(screen.getByTestId('progression-meter-pct')).toHaveTextContent('63%');
    expect(screen.getByText('Young Boys Call-Up')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 goals met')).toBeInTheDocument();
    expect(screen.getByText(/Compete in 10 matches/)).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('shows a null metric as needing rated matches', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([ownerView]);
    render(<CallUpProgress playerId="p1" />);

    expect(await screen.findByText('Needs 5 rated matches')).toBeInTheDocument();
    expect(screen.getByText(/Average 3\.0★ over at least 5 rated matches/)).toBeInTheDocument();
  });

  it('shows only the bar on the public view', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([publicView]);
    render(<CallUpProgress playerId="p1" showGoals={false} />);

    expect(await screen.findByRole('progressbar', { name: 'Call-Up Progress' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Call-up goals' })).not.toBeInTheDocument();
    expect(screen.queryByText(/goals met/)).not.toBeInTheDocument();
  });

  it('hides the checklist when showGoals is false even if goals came back', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([ownerView]);
    render(<CallUpProgress playerId="p1" showGoals={false} />);

    expect(await screen.findByRole('progressbar', { name: 'Call-Up Progress' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Call-up goals' })).not.toBeInTheDocument();
  });

  it('renders nothing for a player on no call-up track', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([{ ...publicView, kind: 'promotion' }]);
    const { container } = render(<CallUpProgress playerId="p2" />);

    await waitFor(() => expect(mockProgressionApi.getForPlayer).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing when there are no tracks or the request fails', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValueOnce([]);
    const empty = render(<CallUpProgress playerId="p2" />);
    await waitFor(() => expect(mockProgressionApi.getForPlayer).toHaveBeenCalledTimes(1));
    expect(empty.container).toBeEmptyDOMElement();

    mockProgressionApi.getForPlayer.mockRejectedValueOnce(new Error('boom'));
    const failed = render(<CallUpProgress playerId="p3" />);
    await waitFor(() => expect(mockProgressionApi.getForPlayer).toHaveBeenCalledTimes(2));
    expect(failed.container).toBeEmptyDOMElement();
  });
});

describe('counting since note (PRL-07)', () => {
  const since = '2026-06-01T12:00:00.000Z';

  it('shows the owner the date and why the count restarted', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([
      { ...ownerView, countingSince: since, countingSinceReason: { type: 'callup', divisionName: 'Young Boys' } },
    ]);
    render(<CallUpProgress playerId="p1" />);

    expect(await screen.findByText('Counting since your call-up to Young Boys on Jun 1, 2026')).toBeInTheDocument();
    const hint = screen.getByRole('button', { name: 'About this count' });
    expect(hint).toHaveAccessibleDescription('Your record still includes every match. Only this goal restarted.');
  });

  it('says when the goals were reset', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([
      { ...ownerView, countingSince: since, countingSinceReason: { type: 'goalsReset' } },
    ]);
    render(<CallUpProgress playerId="p1" />);

    expect(await screen.findByText('Counting since your goals were reset on Jun 1, 2026')).toBeInTheDocument();
  });

  it('falls back to the date alone when no reason came back', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([{ ...publicView, countingSince: since }]);
    render(<CallUpProgress playerId="p1" showGoals={false} />);

    expect(await screen.findByText('Counting since Jun 1, 2026')).toBeInTheDocument();
  });

  it('leaves the division out when it no longer exists', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([
      { ...ownerView, countingSince: since, countingSinceReason: { type: 'divisionChange', divisionName: null } },
    ]);
    render(<CallUpProgress playerId="p1" />);

    expect(await screen.findByText('Counting since you joined your division on Jun 1, 2026')).toBeInTheDocument();
  });

  it('renders no note without a window start', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([ownerView]);
    render(<CallUpProgress playerId="p1" />);

    await screen.findByRole('heading', { name: 'Road to the Main Roster' });
    expect(screen.queryByTestId('counting-since')).not.toBeInTheDocument();
  });

  it('shows the note on the dashboard card too', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([
      { ...ownerView, countingSince: since, countingSinceReason: { type: 'promotion', divisionName: 'Raw' } },
    ]);
    render(<MemoryRouter><DashboardCallUp /></MemoryRouter>);

    expect(await screen.findByText('Counting since your promotion to Raw on Jun 1, 2026')).toBeInTheDocument();
  });

  it('reads naturally in German', async () => {
    await i18n.changeLanguage('de');
    mockProgressionApi.getForPlayer.mockResolvedValue([
      { ...ownerView, countingSince: since, countingSinceReason: { type: 'promotion', divisionName: 'Raw' } },
    ]);
    const { unmount } = render(<CallUpProgress playerId="p1" />);
    try {
      expect(await screen.findByText('Gezählt wird seit deinem Aufstieg in Raw am 01.06.2026')).toBeInTheDocument();
    } finally {
      unmount();
      await i18n.changeLanguage('en');
    }
  });
});

describe('DashboardCallUp', () => {
  it('shows the card with a link to the profile for a Young Boy', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([ownerView]);
    render(<MemoryRouter><DashboardCallUp /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Road to the Main Roster' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View your goals' })).toHaveAttribute('href', '/profile');
    expect(screen.getByText('1 of 3 goals met')).toBeInTheDocument();
  });

  it('does not fetch or render for visitors', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isWrestler: false, playerId: null });
    const { container } = render(<MemoryRouter><DashboardCallUp /></MemoryRouter>);

    expect(container).toBeEmptyDOMElement();
    expect(mockProgressionApi.getForPlayer).not.toHaveBeenCalled();
  });

  it('renders nothing for a wrestler on no call-up track', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([]);
    const { container } = render(<MemoryRouter><DashboardCallUp /></MemoryRouter>);

    await waitFor(() => expect(mockProgressionApi.getForPlayer).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
