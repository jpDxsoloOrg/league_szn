import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import i18n from '../../../i18n';
import type { PlayerProgressionSummary, ProgressionConsiderationEntry } from '../../../types/progression';

const { mockProgressionApi, mockUseSiteConfig } = vi.hoisted(() => ({
  mockProgressionApi: { getForPlayer: vi.fn(), getConsiderations: vi.fn() },
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  progressionApi: mockProgressionApi,
}));

vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: mockUseSiteConfig,
}));

import DivisionProgress from '../DivisionProgress';
import DivisionWatchBanners from '../DivisionWatchBanners';
import { profileViewer, staySharpTips } from '../divisionProgressVisibility';
import { resetConsiderationsCache } from '../../../hooks/useConsiderations';

const promotion: PlayerProgressionSummary = {
  trackId: 'track-promo',
  kind: 'promotion',
  trackName: 'Raw to SmackDown',
  progressPct: 70,
  consideration: true,
  computedAt: '2026-11-01T00:00:00.000Z',
  goals: [
    { goalId: 'wins', metric: 'wins', threshold: 10, weight: 1, direction: 'atLeast', current: 7, met: false },
  ],
  considerationDetail: { status: 'considering', markedBy: 'gm', markedAt: '2026-11-02T00:00:00.000Z', note: 'Hot run' },
};

const relegation: PlayerProgressionSummary = {
  trackId: 'track-releg',
  kind: 'relegation',
  trackName: 'Raw drop zone',
  progressPct: 80,
  consideration: true,
  computedAt: '2026-11-01T00:00:00.000Z',
  goals: [
    { goalId: 'loss', metric: 'lossPct', threshold: 60, weight: 1, direction: 'atLeast', current: 65, met: true },
    { goalId: 'idle', metric: 'daysSinceLastMatch', threshold: 30, weight: 1, direction: 'atLeast', current: 5, met: false },
    { goalId: 'streak', metric: 'currentLossStreak', threshold: 3, weight: 1, direction: 'atLeast', current: 4, met: true },
  ],
};

const strip = (track: PlayerProgressionSummary): PlayerProgressionSummary => ({
  trackId: track.trackId,
  kind: track.kind,
  trackName: track.trackName,
  progressPct: track.progressPct,
  consideration: track.consideration,
  computedAt: track.computedAt,
});

const flagged = (kind: string): ProgressionConsiderationEntry[] => [{
  playerId: 'p1',
  name: 'Kenta',
  wrestlerName: kind,
  trackId: `track-${kind}`,
  markedAt: '2026-11-10T00:00:00.000Z',
}];

function setWatch(publicRelegationWatch: boolean) {
  mockUseSiteConfig.mockReturnValue({ tickerSettings: { publicRelegationWatch } });
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  vi.clearAllMocks();
  resetConsiderationsCache();
  setWatch(false);
  mockProgressionApi.getConsiderations.mockImplementation(async (kind: string) => flagged(kind));
});

describe('DivisionProgress', () => {
  it('shows a regular viewer only the gold promotion meter by default', async () => {
    // Even if a relegation row slipped through, the public view drops it.
    mockProgressionApi.getForPlayer.mockResolvedValue([strip(promotion), strip(relegation)]);
    render(<DivisionProgress playerId="p1" viewer="public" />);

    expect(await screen.findByRole('progressbar', { name: 'Promotion Progress' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Relegation Danger' })).not.toBeInTheDocument();
    expect(screen.queryByText(/relegation/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('progression-track-promotion').querySelector('.progression-meter--promotion')).not.toBeNull();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('division-flag-promotion')).not.toBeInTheDocument();
  });

  it('shows the relegation meter publicly once the league turns the watch on', async () => {
    setWatch(true);
    mockProgressionApi.getForPlayer.mockResolvedValue([strip(relegation), strip(promotion)]);
    render(<DivisionProgress playerId="p1" viewer="public" />);

    const meters = await screen.findAllByRole('progressbar');
    expect(meters.map((meter) => meter.getAttribute('aria-label'))).toEqual(['Promotion Progress', 'Relegation Danger']);
  });

  it('renders nothing for a public viewer when only relegation data exists and the watch is off', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([strip(relegation)]);
    const { container } = render(<DivisionProgress playerId="p1" viewer="public" />);

    await waitFor(() => expect(mockProgressionApi.getForPlayer).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('gives the owner the promotion checklist and gentle tips, never a relegation meter', async () => {
    setWatch(true);
    mockProgressionApi.getForPlayer.mockResolvedValue([
      { ...promotion, considerationDetail: undefined },
      { ...relegation, consideration: false },
    ]);
    render(<DivisionProgress playerId="p1" viewer="owner" />);

    expect(await screen.findByRole('progressbar', { name: 'Promotion Progress' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Promotion goals' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Relegation Danger' })).not.toBeInTheDocument();

    const tips = screen.getByTestId('stay-sharp');
    expect(tips).toHaveTextContent('Stay sharp');
    expect(tips).toHaveTextContent('Chase a few more wins');
    expect(tips).toHaveTextContent('Your next win is a great reset');
    // Unmet danger goals (the idle one) are not nagged about.
    expect(tips).not.toHaveTextContent('Stay active');
    expect(screen.getByTestId('division-progress').textContent ?? '').not.toMatch(/relegat|loss|lose|danger/i);
    expect(screen.queryByTestId('division-flag-promotion')).not.toBeInTheDocument();
  });

  it('shows the owner nothing extra when no relegation goal is tripped', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([
      { ...relegation, consideration: false, goals: relegation.goals?.map((goal) => ({ ...goal, met: false })) },
    ]);
    const { container } = render(<DivisionProgress playerId="p1" viewer="owner" />);

    await waitFor(() => expect(mockProgressionApi.getForPlayer).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows staff both meters, every goal and the GM flags', async () => {
    mockProgressionApi.getForPlayer.mockResolvedValue([relegation, promotion]);
    render(<DivisionProgress playerId="p1" viewer="staff" />);

    expect(await screen.findByRole('progressbar', { name: 'Promotion Progress' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Relegation Danger' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Promotion goals' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Relegation criteria' })).toBeInTheDocument();
    expect(screen.getByTestId('division-flag-promotion')).toHaveTextContent('Promotion watch');
    expect(screen.getByTestId('division-flag-promotion')).toHaveTextContent('GM note: Hot run');
    expect(screen.getByTestId('division-flag-relegation')).toHaveTextContent('Relegation danger');
    expect(screen.queryByTestId('stay-sharp')).not.toBeInTheDocument();
  });
});

describe('DivisionWatchBanners', () => {
  it('shows a regular viewer the promotion banner and never asks for the relegation list', async () => {
    render(<DivisionWatchBanners playerId="p1" viewer="public" />);

    expect(await screen.findByText('On promotion watch')).toBeInTheDocument();
    expect(mockProgressionApi.getConsiderations).toHaveBeenCalledWith('promotion');
    expect(mockProgressionApi.getConsiderations).not.toHaveBeenCalledWith('relegation');
    expect(screen.getAllByTestId('consideration-banner')).toHaveLength(1);
  });

  it('never shows the owner a relegation flag, even with the public watch on', async () => {
    setWatch(true);
    render(<DivisionWatchBanners playerId="p1" viewer="owner" />);

    expect(await screen.findByText('On promotion watch')).toBeInTheDocument();
    expect(mockProgressionApi.getConsiderations).not.toHaveBeenCalledWith('relegation');
  });

  it('shows the relegation banner to staff', async () => {
    render(<DivisionWatchBanners playerId="p1" viewer="staff" />);

    expect(await screen.findByText('In relegation danger')).toBeInTheDocument();
    expect(screen.getByText('On promotion watch')).toBeInTheDocument();
  });

  it('shows the relegation banner to the public only when the watch is public', async () => {
    setWatch(true);
    render(<DivisionWatchBanners playerId="p1" viewer="public" />);

    expect(await screen.findByText('In relegation danger')).toBeInTheDocument();
    expect(mockProgressionApi.getConsiderations).toHaveBeenCalledWith('relegation');
  });
});

describe('divisionProgressVisibility', () => {
  it('picks the viewer from role and player id', () => {
    expect(profileViewer({ isStaff: true, viewerPlayerId: 'p1', profilePlayerId: 'p1' })).toBe('staff');
    expect(profileViewer({ isStaff: false, viewerPlayerId: 'p1', profilePlayerId: 'p1' })).toBe('owner');
    expect(profileViewer({ isStaff: false, viewerPlayerId: 'p2', profilePlayerId: 'p1' })).toBe('public');
    expect(profileViewer({ isStaff: false, viewerPlayerId: null, profilePlayerId: 'p1' })).toBe('public');
  });

  it('collapses tripped goals into distinct friendly tips', () => {
    const goals = relegation.goals ?? [];
    expect(staySharpTips([{ ...relegation, goals: [...goals, { ...goals[0], goalId: 'loss-last' }] }]))
      .toEqual(['wins', 'winColumn']);
    expect(staySharpTips([promotion])).toEqual([]);
  });
});
