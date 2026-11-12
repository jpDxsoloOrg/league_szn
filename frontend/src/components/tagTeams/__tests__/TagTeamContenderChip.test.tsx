import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockGetAllChampionships, mockGetForChampionship, mockUseSiteConfig } = vi.hoisted(() => ({
  mockGetAllChampionships: vi.fn(),
  mockGetForChampionship: vi.fn(),
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  championshipsApi: { getAll: mockGetAllChampionships },
  contendersApi: { getForChampionship: mockGetForChampionship },
}));

vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: mockUseSiteConfig,
}));

const stableTranslation = {
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${Object.entries(options).map(([name, value]) => `${name}=${String(value)}`).join(' ')}` : key,
};
vi.mock('react-i18next', () => ({
  useTranslation: () => stableTranslation,
}));

import TagTeamContenderChip from '../TagTeamContenderChip';

const member = { playerId: 'p1', playerName: 'Adam', wrestlerName: 'Edge', imageUrl: null };

function tagRow(tagTeamId: string, rank: number) {
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
    matchesInPeriod: 4,
    winsInPeriod: 3,
    previousRank: rank,
    peakRank: rank,
    weeksAtTop: 0,
    calculatedAt: '',
    updatedAt: '',
    movement: 0,
    isNew: false,
  };
}

const championships = [
  { championshipId: 'c1', name: 'World Tag Team Championship', type: 'tag', isActive: true, createdAt: '' },
  { championshipId: 'c2', name: 'World Heavyweight Championship', type: 'singles', isActive: true, createdAt: '' },
  { championshipId: 'c3', name: 'Retired Tag Titles', type: 'tag', isActive: false, createdAt: '' },
];

const renderChip = () =>
  render(
    <MemoryRouter>
      <TagTeamContenderChip tagTeamId="tt1" />
    </MemoryRouter>,
  );

describe('TagTeamContenderChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSiteConfig.mockReturnValue({ features: { contenders: true } });
    mockGetAllChampionships.mockResolvedValue(championships);
  });

  it('shows the rank for each tag title the team is ranked on, and only loads active tag titles', async () => {
    mockGetForChampionship.mockResolvedValue({
      championshipId: 'c1',
      championshipName: 'World Tag Team Championship',
      currentChampion: null,
      contenders: [tagRow('tt9', 1), tagRow('tt7', 2), tagRow('tt1', 3)],
      calculatedAt: null,
    });

    renderChip();

    const chip = await screen.findByRole('link', { name: /tagTeams.contenderChip.label/ });
    expect(chip).toHaveTextContent('rank=3 championship=World Tag Team Championship');
    expect(chip).toHaveAttribute('href', '/contenders');
    expect(mockGetForChampionship).toHaveBeenCalledTimes(1);
    expect(mockGetForChampionship).toHaveBeenCalledWith('c1', expect.anything());
  });

  it('renders nothing when the team is not ranked', async () => {
    mockGetForChampionship.mockResolvedValue({
      championshipId: 'c1',
      championshipName: 'World Tag Team Championship',
      currentChampion: null,
      contenders: [tagRow('tt9', 1)],
      calculatedAt: null,
    });

    const { container } = renderChip();

    await waitFor(() => expect(mockGetForChampionship).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('loads nothing when the contenders feature is off', async () => {
    mockUseSiteConfig.mockReturnValue({ features: { contenders: false } });

    const { container } = renderChip();

    expect(container).toBeEmptyDOMElement();
    expect(mockGetAllChampionships).not.toHaveBeenCalled();
  });
});
