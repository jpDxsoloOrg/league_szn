import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { mockGetDirectory, mockGetById, mockGetStandings, mockGetMatches, mockGetChampionships, mockListRivalries, mockInjuriesApi, authState, features } = vi.hoisted(() => ({
  mockGetDirectory: vi.fn(),
  mockGetById: vi.fn(),
  mockGetStandings: vi.fn(),
  mockGetMatches: vi.fn(),
  mockGetChampionships: vi.fn(),
  mockListRivalries: vi.fn(),
  // INJ-12
  mockInjuriesApi: { getPlayerCondition: vi.fn(), getPlayerHistory: vi.fn() },
  authState: { isAuthenticated: false, isWrestler: false, isAdminOrModerator: false, playerId: null as string | null },
  features: { statistics: true, challenges: true, injuries: false },
}));

vi.mock('../../../services/api', () => ({
  playersApi: {
    getById: mockGetById,
    getDirectory: mockGetDirectory,
  },
  matchesApi: { getAll: mockGetMatches },
  championshipsApi: { getAll: mockGetChampionships },
  rivalriesApi: { list: mockListRivalries },
  standingsApi: { get: mockGetStandings },
  divisionsApi: { getAll: vi.fn().mockResolvedValue([{ divisionId: 'd1', name: 'Raw' }]) },
  factionsApi: { getAll: vi.fn().mockResolvedValue([]) },
  tagTeamsApi: { getAll: vi.fn().mockResolvedValue([]) },
  isApiError: (err: unknown, status: number) => (err as { status?: number }).status === status,
}));

vi.mock('../../../services/api/injuries.api', () => ({ injuriesApi: mockInjuriesApi }));

vi.mock('../BuildCard', () => ({
  default: ({ playerId, isOwnProfile }: { playerId: string; isOwnProfile?: boolean }) => (
    <div data-testid="build-card-stub">{`${playerId} own:${String(isOwnProfile)}`}</div>
  ),
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: () => ({ features, tickerSettings: { publicRelegationWatch: false } }) }));

const stableT = (key: string, options?: Record<string, unknown>) =>
  (options ? `${key} ${Object.values(options).join(' ')}` : key);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT, i18n: { language: 'en' } }) }));

import PublicProfile from '../PublicProfile';

const player = {
  playerId: 'p1',
  name: 'Alice',
  currentWrestler: 'Cody Rhodes',
  divisionId: 'd1',
  wins: 6,
  losses: 3,
  draws: 1,
};

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/player/p1']}>
      <Routes>
        <Route path="/player/:playerId" element={<PublicProfile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(authState, { isAuthenticated: false, isWrestler: false, isAdminOrModerator: false, playerId: null });
    features.injuries = false;
    mockGetById.mockResolvedValue(player);
    mockGetDirectory.mockResolvedValue([{ playerId: 'p2', name: 'Bob', currentWrestler: 'Edge' }]);
    mockGetStandings.mockResolvedValue({ players: [{ playerId: 'p1', mainOverall: 88 }] });
    mockGetMatches.mockResolvedValue([]);
    mockGetChampionships.mockResolvedValue([]);
    mockListRivalries.mockResolvedValue({ rivalries: [] });
  });

  const completed = (matchId: string, date: string, winner: string, loser: string) => ({
    matchId, date, matchFormat: 'singles', participants: ['p1', 'p2'], winners: [winner], losers: [loser], status: 'completed', isChampionship: false,
  });

  it('leads with the wrestler and shows the record, overall and division', async () => {
    renderProfile();

    expect(await screen.findByRole('heading', { level: 1, name: 'Cody Rhodes' })).toBeInTheDocument();
    expect(screen.getByText('6-3-1')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('Raw')).toBeInTheDocument();
  });

  it('shows all-time points and the rank inside the division table', async () => {
    mockGetStandings.mockResolvedValue({
      rankedBy: 'points',
      players: [{
        playerId: 'p1',
        divisionId: 'd1',
        points: 19,
        rank: 5,
        divisionRecord: { wins: 2, losses: 0, draws: 0, recentForm: [], currentStreak: { type: 'W', count: 2 }, points: 6, rank: 2 },
      }],
    });
    renderProfile();

    expect(await screen.findByText('publicProfile.points')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    // Division rank, not the overall rank of 5.
    expect(screen.getByText('publicProfile.rankInDivision 2 Raw')).toBeInTheDocument();
  });

  it('falls back to the overall rank for a player with no division', async () => {
    mockGetById.mockResolvedValue({ ...player, divisionId: undefined });
    mockGetStandings.mockResolvedValue({ players: [{ playerId: 'p1', points: 4, rank: 3 }] });
    renderProfile();

    expect(await screen.findByText('publicProfile.rankOverall 3')).toBeInTheDocument();
  });

  it('leaves points and rank out when the standings do not list the player', async () => {
    mockGetStandings.mockResolvedValue({ players: [] });
    renderProfile();

    expect(await screen.findByText('6-3-1')).toBeInTheDocument();
    expect(screen.queryByText('publicProfile.points')).not.toBeInTheDocument();
    expect(screen.queryByText('publicProfile.rank')).not.toBeInTheDocument();
  });

  it('builds form and recent matches from the player own matches, even when standings leave them out', async () => {
    mockGetStandings.mockResolvedValue({ players: [] });
    mockGetMatches.mockResolvedValue([
      completed('m1', '2026-03-01', 'p1', 'p2'),
      completed('m2', '2026-04-01', 'p2', 'p1'),
      completed('m3', '2026-05-01', 'p2', 'p1'),
    ]);
    renderProfile();

    expect(await screen.findByRole('img', { name: /ui.formDots.label/ })).toBeInTheDocument();
    expect(mockGetMatches).toHaveBeenCalledWith({ playerId: 'p1' }, expect.any(AbortSignal));
    expect(screen.getByText('publicProfile.streakValue 2 L')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /vs Edge|common.vs Edge/ })).toHaveLength(3);
  });

  it('calls an opponent whose row is gone a former member', async () => {
    mockGetMatches.mockResolvedValue([
      { ...completed('m1', '2026-03-01', 'p1', 'gone'), participants: ['p1', 'gone'] },
    ]);
    renderProfile();

    expect(await screen.findByRole('link', { name: /common.vs common.formerMember/ })).toBeInTheDocument();
  });

  it('does not call opponents former members when the names failed to load', async () => {
    mockGetDirectory.mockRejectedValue(new Error('burst'));
    mockGetMatches.mockResolvedValue([completed('m1', '2026-03-01', 'p1', 'p2')]);
    renderProfile();

    expect(await screen.findByRole('link', { name: /common.vs common.unknown/ })).toBeInTheDocument();
  });

  it('shows the titles a player holds and any active rivalry', async () => {
    mockGetChampionships.mockResolvedValue([
      { championshipId: 'c1', name: 'World Heavyweight Title', type: 'singles', currentChampion: 'p1', isActive: true },
      { championshipId: 'c2', name: 'Other Title', type: 'singles', currentChampion: 'p2', isActive: true },
    ]);
    mockListRivalries.mockResolvedValue({
      rivalries: [{
        rivalryId: 'r1', title: 'Bad Blood', heat: 'hot', heatScore: 60, status: 'active',
        participants: [{ playerId: 'p1' }, { playerId: 'p2' }],
      }],
    });
    renderProfile();

    expect(await screen.findByText('World Heavyweight Title')).toHaveClass('profile-hero__title--world');
    expect(screen.queryByText('Other Title')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bad Blood/ })).toHaveAttribute('href', '/rivalries/r1');
  });

  it('still shows the profile when the extras fail to load', async () => {
    mockGetStandings.mockRejectedValue(new Error('down'));
    mockGetMatches.mockRejectedValue(new Error('down'));
    mockGetChampionships.mockRejectedValue(new Error('down'));
    mockListRivalries.mockRejectedValue(new Error('down'));
    renderProfile();

    expect(await screen.findByText('6-3-1')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /ui.formDots.label/ })).not.toBeInTheDocument();
  });

  it('keeps the head-to-head and stats links, and offers a challenge to other wrestlers', async () => {
    Object.assign(authState, { isAuthenticated: true, isWrestler: true, playerId: 'me' });
    renderProfile();

    expect(await screen.findByRole('link', { name: 'publicProfile.viewHeadToHead' })).toHaveAttribute(
      'href',
      '/stats/head-to-head?player1=me&player2=p1',
    );
    expect(screen.getByRole('link', { name: 'publicProfile.fullStats' })).toHaveAttribute('href', '/stats/player/p1');
    expect(screen.getByRole('link', { name: 'publicProfile.challenge' })).toHaveAttribute(
      'href',
      '/promos/new?promoType=call-out&targetPlayerId=p1',
    );
  });

  it('shows a not-found state for a player the API cannot return', async () => {
    mockGetById.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }));
    renderProfile();

    expect(await screen.findByText('publicProfile.notFoundTitle')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('publicProfile.notFound');
  });

  it('shows the build card, marked as the viewer\'s own only on their own profile', async () => {
    renderProfile();
    expect(await screen.findByTestId('build-card-stub')).toHaveTextContent('p1 own:false');
  });

  it('passes isOwnProfile when the viewer is the player', async () => {
    Object.assign(authState, { isAuthenticated: true, isWrestler: true, playerId: 'p1' });
    renderProfile();
    expect(await screen.findByTestId('build-card-stub')).toHaveTextContent('p1 own:true');
  });

  // INJ-12: stamina is for the player and staff; the injury badge and history are public.
  describe('stamina and injuries', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const returnsAt = new Date(Date.now() + 10 * DAY_MS).toISOString();
    const condition = {
      playerId: 'p1', stamina: 35, maxStamina: 100, band: 2, bandCount: 4, weeklyRecovery: 'full',
      nextRecoveryAt: new Date(Date.now() + 3 * DAY_MS).toISOString(), currentInjury: null, nextMatch: null,
    };

    beforeEach(() => {
      features.injuries = true;
      mockGetById.mockResolvedValue({
        ...player,
        currentInjury: { injuryId: 'i1', startedAt: new Date().toISOString(), returnsAt, severity: 'minor', weeks: 1 },
      });
      mockInjuriesApi.getPlayerCondition.mockResolvedValue(condition);
      mockInjuriesApi.getPlayerHistory.mockResolvedValue([
        { injuryId: 'i1', startedAt: new Date().toISOString(), returnsAt, severity: 'minor', weeks: 1 },
      ]);
    });

    it('shows the player their own stamina meter', async () => {
      Object.assign(authState, { isAuthenticated: true, isWrestler: true, playerId: 'p1' });
      renderProfile();
      expect(await screen.findByTestId('stamina-meter')).toBeInTheDocument();
      expect(mockInjuriesApi.getPlayerCondition).toHaveBeenCalledWith('p1', expect.anything());
    });

    it('shows staff the stamina meter', async () => {
      Object.assign(authState, { isAuthenticated: true, isWrestler: false, isAdminOrModerator: true, playerId: null });
      renderProfile();
      expect(await screen.findByTestId('stamina-meter')).toBeInTheDocument();
    });

    it('never asks for or shows stamina to another wrestler, who still sees the injury badge and history', async () => {
      Object.assign(authState, { isAuthenticated: true, isWrestler: true, playerId: 'me' });
      renderProfile();
      expect(await screen.findByTestId('injury-badge')).toBeInTheDocument();
      expect(await screen.findByText('injuries.history.title')).toBeInTheDocument();
      expect(screen.queryByTestId('stamina-meter')).not.toBeInTheDocument();
      expect(mockInjuriesApi.getPlayerCondition).not.toHaveBeenCalled();
    });

    it('hides the meter, badge and history while the injuries feature is off', async () => {
      features.injuries = false;
      Object.assign(authState, { isAuthenticated: true, isWrestler: true, playerId: 'p1' });
      renderProfile();
      expect(await screen.findByRole('heading', { level: 1, name: 'Cody Rhodes' })).toBeInTheDocument();
      expect(screen.queryByTestId('injury-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('stamina-meter')).not.toBeInTheDocument();
      expect(mockInjuriesApi.getPlayerCondition).not.toHaveBeenCalled();
      expect(mockInjuriesApi.getPlayerHistory).not.toHaveBeenCalled();
    });
  });
});
