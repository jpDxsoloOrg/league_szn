import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

const {
  mockGetMyProfile,
  mockTagTeamsGetById,
  mockTagTeamsGetAll,
  mockTagTeamsUpdate,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockGetMyProfile: vi.fn(),
  mockTagTeamsGetById: vi.fn(),
  mockTagTeamsGetAll: vi.fn(),
  mockTagTeamsUpdate: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  profileApi: {
    getMyProfile: mockGetMyProfile,
  },
  tagTeamsApi: {
    getById: mockTagTeamsGetById,
    getAll: mockTagTeamsGetAll,
    update: mockTagTeamsUpdate,
  },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

const stableT = (_key: string, fallback?: string) => fallback ?? _key;
const stableUseTranslation = { t: stableT };
vi.mock('react-i18next', () => ({
  useTranslation: () => stableUseTranslation,
}));

vi.mock('../MyTagTeam.css', () => ({}));
vi.mock('../CreateTagTeamModal', () => ({
  default: () => null,
}));

import MyTagTeam from '../MyTagTeam';

const profile = {
  playerId: 'p1',
  name: 'Adam',
  currentWrestler: 'Edge (solo)',
  wins: 0,
  losses: 0,
  draws: 0,
  tagTeamId: 'tt1',
  createdAt: '',
  updatedAt: '',
};

const tagTeamDetail = {
  tagTeamId: 'tt1',
  name: 'The Brood',
  player1Id: 'p1',
  player2Id: 'p2',
  player1WrestlerName: undefined,
  player2WrestlerName: undefined,
  status: 'active',
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: '',
  updatedAt: '',
  player1: {
    playerId: 'p1',
    playerName: 'Adam',
    wrestlerName: 'Edge (solo)',
  },
  player2: {
    playerId: 'p2',
    playerName: 'Jay',
    wrestlerName: 'Christian (solo)',
  },
  standings: {
    winPercentage: 0,
    recentForm: [],
    currentStreak: { type: 'W', count: 0 },
  },
  headToHead: [],
  matchTypeRecords: [],
  recentMatches: [],
};

function renderMyTagTeam() {
  return render(
    <BrowserRouter>
      <MyTagTeam />
    </BrowserRouter>
  );
}

describe('MyTagTeam — TTP-01 edit-identity form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockGetMyProfile.mockResolvedValue(profile);
    mockTagTeamsGetById.mockResolvedValue(tagTeamDetail);
    mockTagTeamsGetAll.mockResolvedValue([]);
    mockTagTeamsUpdate.mockResolvedValue(tagTeamDetail);
  });

  it('submits the edit form with name + both wrestler-name fields', async () => {
    const user = userEvent.setup();
    renderMyTagTeam();

    // Wait for the form to render once data has loaded
    const teamNameInput = await screen.findByLabelText('Tag Team Name');
    const myWrestlerInput = screen.getByLabelText('Your wrestler in this team');
    const partnerWrestlerInput = screen.getByLabelText("Partner's wrestler in this team");

    // Fields are seeded from the loaded detail (override falls back to currentWrestler)
    expect(teamNameInput).toHaveValue('The Brood');
    expect(myWrestlerInput).toHaveValue('Edge (solo)');
    expect(partnerWrestlerInput).toHaveValue('Christian (solo)');

    await user.clear(myWrestlerInput);
    await user.type(myWrestlerInput, 'Brood Edge');
    await user.clear(partnerWrestlerInput);
    await user.type(partnerWrestlerInput, 'Brood Christian');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockTagTeamsUpdate).toHaveBeenCalledTimes(1);
    });
    expect(mockTagTeamsUpdate).toHaveBeenCalledWith('tt1', {
      name: 'The Brood',
      player1WrestlerName: 'Brood Edge',
      player2WrestlerName: 'Brood Christian',
    });
  });
});
