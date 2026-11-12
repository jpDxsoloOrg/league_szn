import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const {
  mockGetMyProfile,
  mockGetTagTeam,
  mockGetAllChampionships,
  mockGetForChampionship,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockGetMyProfile: vi.fn(),
  mockGetTagTeam: vi.fn(),
  mockGetAllChampionships: vi.fn(),
  mockGetForChampionship: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  profileApi: { getMyProfile: mockGetMyProfile },
  tagTeamsApi: { getById: mockGetTagTeam },
  championshipsApi: { getAll: mockGetAllChampionships },
  contendersApi: { getForChampionship: mockGetForChampionship },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

const stableTranslation = {
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${Object.entries(options).map(([name, value]) => `${name}=${String(value)}`).join(' ')}` : key,
};
vi.mock('react-i18next', () => ({
  useTranslation: () => stableTranslation,
}));

import MyContenderStatus from '../MyContenderStatus';

const member = { playerId: 'p1', playerName: 'Adam', wrestlerName: 'Edge', imageUrl: null };

function tagRow(tagTeamId: string, rank: number, overrides: Record<string, unknown> = {}) {
  return {
    entityType: 'tagTeam',
    playerId: tagTeamId,
    tagTeamId,
    tagTeamName: `Team ${tagTeamId}`,
    tagTeamImageUrl: null,
    tagTeamStatus: 'active',
    members: [member, { ...member, playerId: 'p2' }],
    playerName: 'Adam & Jay',
    wrestlerName: `Team ${tagTeamId}`,
    imageUrl: null,
    championshipId: 'c1',
    rank,
    rankingScore: 50,
    winPercentage: 60,
    currentStreak: 1,
    qualityScore: 0,
    recencyScore: 0,
    matchesInPeriod: 5,
    winsInPeriod: 3,
    previousRank: rank,
    peakRank: rank,
    weeksAtTop: 0,
    calculatedAt: '',
    updatedAt: '',
    movement: 0,
    isNew: false,
    ...overrides,
  };
}

const profile = { playerId: 'p1', name: 'Adam', currentWrestler: 'Edge', wins: 0, losses: 0, draws: 0, tagTeamId: 'tt1' };
const team = { tagTeamId: 'tt1', name: 'The Brood', player1Id: 'p1', player2Id: 'p2', status: 'active' };

const renderPage = () =>
  render(
    <MemoryRouter>
      <MyContenderStatus />
    </MemoryRouter>,
  );

const tagSection = () => screen.getByRole('region', { name: 'contenders.myStatus.tagTitles.heading' });

describe('MyContenderStatus — tag titles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isWrestler: true });
    mockGetMyProfile.mockResolvedValue(profile);
    mockGetTagTeam.mockResolvedValue(team);
    mockGetAllChampionships.mockResolvedValue([
      { championshipId: 'c1', name: 'World Tag Team Championship', type: 'tag', isActive: true, createdAt: '' },
      { championshipId: 'c2', name: 'Tag Team Cup', type: 'tag', isActive: true, createdAt: '' },
      { championshipId: 'c3', name: 'World Heavyweight Championship', type: 'singles', isActive: true, createdAt: '' },
    ]);
  });

  it('tells a wrestler with no tag team that they have no tag rankings', async () => {
    mockGetMyProfile.mockResolvedValue({ ...profile, tagTeamId: undefined });

    renderPage();

    expect(await screen.findByText('contenders.myStatus.tagTitles.notInTeam')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'contenders.myStatus.tagTitles.goToMyTagTeam' }))
      .toHaveAttribute('href', '/my-tag-team');
    expect(mockGetTagTeam).not.toHaveBeenCalled();
    expect(mockGetAllChampionships).not.toHaveBeenCalled();
  });

  it('shows the team rank and movement on a title it is ranked on, and matches needed where it is not', async () => {
    mockGetForChampionship.mockImplementation(async (championshipId: string) => (
      championshipId === 'c1'
        ? {
            championshipId: 'c1',
            championshipName: 'World Tag Team Championship',
            currentChampion: null,
            contenders: [tagRow('tt9', 1), tagRow('tt1', 2, { previousRank: 4, movement: 2 })],
            calculatedAt: null,
            config: { championshipId: 'c1', minimumMatches: 4, maxContenders: 10, includeDraws: false, divisionRestricted: false },
          }
        : {
            championshipId: 'c2',
            championshipName: 'Tag Team Cup',
            currentChampion: null,
            contenders: [tagRow('tt9', 1)],
            calculatedAt: null,
          }
    ));

    renderPage();

    const ranked = (await screen.findByText('World Tag Team Championship')).closest('li') as HTMLElement;
    expect(within(ranked).getByText('contenders.myStatus.tagTitles.rank rank=2')).toBeInTheDocument();
    expect(within(ranked).getByText('contenders.movedUp places=2')).toBeInTheDocument();
    expect(within(ranked).getByText('contenders.myStatus.tagTitles.matchesInPeriod count=5')).toBeInTheDocument();

    const unranked = screen.getByText('Tag Team Cup').closest('li') as HTMLElement;
    expect(within(unranked).getByText('contenders.myStatus.tagTitles.unranked')).toBeInTheDocument();
    // No config on this title, so the ranking job's default of 3 applies.
    expect(within(unranked).getByText('contenders.myStatus.tagTitles.matchesNeeded count=3')).toBeInTheDocument();

    expect(within(tagSection()).getByText('contenders.myStatus.tagTitles.teamLabel name=The Brood')).toBeInTheDocument();
    expect(mockGetForChampionship).toHaveBeenCalledTimes(2);
  });

  it('marks a title the team holds as champions', async () => {
    mockGetAllChampionships.mockResolvedValue([
      { championshipId: 'c1', name: 'World Tag Team Championship', type: 'tag', isActive: true, createdAt: '' },
    ]);
    mockGetForChampionship.mockResolvedValue({
      championshipId: 'c1',
      championshipName: 'World Tag Team Championship',
      currentChampion: {
        type: 'tagTeam',
        tagTeamId: 'tt1',
        tagTeamName: 'The Brood',
        tagTeamImageUrl: null,
        members: [member],
        playerName: 'Adam & Jay',
        wrestlerName: 'The Brood',
        imageUrl: null,
      },
      contenders: [tagRow('tt9', 1)],
      calculatedAt: null,
    });

    renderPage();

    const row = (await screen.findByText('World Tag Team Championship')).closest('li') as HTMLElement;
    expect(within(row).getByText('contenders.myStatus.tagTitles.champions')).toBeInTheDocument();
  });

  it('does not rank a team that is still pending approval', async () => {
    mockGetTagTeam.mockResolvedValue({ ...team, status: 'pending_admin' });

    renderPage();

    expect(await screen.findByText('contenders.myStatus.tagTitles.teamNotActive')).toBeInTheDocument();
    expect(mockGetAllChampionships).not.toHaveBeenCalled();
  });

  it('asks a signed-out visitor to log in', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isWrestler: false });

    renderPage();

    expect(screen.getByText('contenders.myStatus.tagTitles.loginRequired')).toBeInTheDocument();
    expect(mockGetMyProfile).not.toHaveBeenCalled();
  });
});
