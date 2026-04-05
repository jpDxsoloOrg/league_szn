import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import type { Player } from '../../../types';

// --- Hoisted mocks ---
const { mockGetAllPlayers, mockGetMyProfile, mockCreateChallenge, mockGetAllStipulations, mockGetAllMatchTypes, mockGetAllTagTeams } = vi.hoisted(() => ({
  mockGetAllPlayers: vi.fn(),
  mockGetMyProfile: vi.fn(),
  mockCreateChallenge: vi.fn(),
  mockGetAllStipulations: vi.fn(),
  mockGetAllMatchTypes: vi.fn(),
  mockGetAllTagTeams: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  playersApi: { getAll: mockGetAllPlayers },
  profileApi: { getMyProfile: mockGetMyProfile },
  challengesApi: { create: mockCreateChallenge },
  stipulationsApi: { getAll: mockGetAllStipulations },
  matchTypesApi: { getAll: mockGetAllMatchTypes },
  tagTeamsApi: { getAll: mockGetAllTagTeams },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const t: Record<string, string> = {
        'challenges.issue.title': 'Issue a Challenge',
        'challenges.issue.selectOpponent': 'Select Opponent',
        'challenges.issue.selectOpponentPlaceholder': '-- Select Opponent --',
        'challenges.issue.matchType': 'Match Type',
        'challenges.issue.selectMatchType': '-- Select Match Type --',
        'challenges.issue.stipulation': 'Stipulation',
        'challenges.issue.championshipMatch': 'Championship Match',
        'challenges.issue.message': 'Message',
        'challenges.issue.messagePlaceholder': 'Say something...',
        'challenges.issue.challengeNote': 'Optional note',
        'challenges.issue.challengeNotePlaceholder': 'Add a short note (optional)',
        'challenges.issue.showPreview': 'Show Preview',
        'challenges.issue.hidePreview': 'Hide Preview',
        'challenges.issue.preview': 'Preview',
        'challenges.issue.submit': 'Submit Challenge',
        'challenges.issue.success': 'Challenge issued successfully!',
        'challenges.issue.issueAnother': 'Issue Another',
        'challenges.detail.backToBoard': 'Back to Challenges',
        'challenges.board.titleMatch': 'Title Match',
        'common.none': 'None',
        'common.cancel': 'Cancel',
        'common.submitting': 'Submitting...',
        'common.vs': 'vs',
      };
      return t[key] || key;
    },
  }),
}));

vi.mock('../IssueChallenge.css', () => ({}));

import IssueChallenge from '../IssueChallenge';

const players: Player[] = [
  {
    playerId: 'p-1', userId: 'u-1', name: 'John', currentWrestler: 'Stone Cold',
    wins: 10, losses: 5, draws: 0, createdAt: '', updatedAt: '',
  },
  {
    playerId: 'p-2', userId: 'u-2', name: 'Jane', currentWrestler: 'The Rock',
    wins: 8, losses: 7, draws: 1, createdAt: '', updatedAt: '',
  },
  {
    playerId: 'p-3', name: 'NoLink', currentWrestler: 'Unlinked Guy',
    wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '',
    // no userId - not linked
  },
];

function renderIssue() {
  return render(
    <BrowserRouter>
      <IssueChallenge />
    </BrowserRouter>
  );
}

describe('IssueChallenge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllPlayers.mockResolvedValue(players);
    mockGetMyProfile.mockResolvedValue({ playerId: 'p-1' });
    mockGetAllStipulations.mockResolvedValue([
      { stipulationId: 'stip-1', name: 'Steel Cage', createdAt: '', updatedAt: '' },
      { stipulationId: 'stip-2', name: 'Ladder', createdAt: '', updatedAt: '' },
      { stipulationId: 'stip-3', name: 'Hell in a Cell', createdAt: '', updatedAt: '' },
    ]);
    mockGetAllTagTeams.mockResolvedValue([]);
    mockGetAllMatchTypes.mockResolvedValue([
      { matchTypeId: 'mt-1', name: 'Singles', createdAt: '', updatedAt: '' },
      { matchTypeId: 'mt-2', name: 'Tag Team', createdAt: '', updatedAt: '' },
      { matchTypeId: 'mt-3', name: 'Triple Threat', createdAt: '', updatedAt: '' },
      { matchTypeId: 'mt-4', name: 'Fatal 4-Way', createdAt: '', updatedAt: '' },
      { matchTypeId: 'mt-5', name: 'Six Pack Challenge', createdAt: '', updatedAt: '' },
      { matchTypeId: 'mt-6', name: 'Battle Royal', createdAt: '', updatedAt: '' },
    ]);
  });

  it('renders the form with opponent, match type, stipulation, and note fields', async () => {
    renderIssue();

    await waitFor(() => {
      expect(screen.getByText('Issue a Challenge')).toBeInTheDocument();
    });

    expect(screen.getByText(/Select Opponent/)).toBeInTheDocument();
    expect(screen.getByText('Match Type')).toBeInTheDocument();
    expect(screen.getByText('Stipulation')).toBeInTheDocument();
    expect(screen.getByText('Optional note')).toBeInTheDocument();
    expect(screen.getByText('Submit Challenge')).toBeInTheDocument();
  });

  it('filters opponents to only linked users, excluding self', async () => {
    renderIssue();

    await waitFor(() => {
      expect(screen.getByText('Issue a Challenge')).toBeInTheDocument();
    });

    // The opponent multi-select should contain "The Rock (Jane)" but NOT self or unlinked
    expect(screen.getByText('The Rock (Jane)')).toBeInTheDocument();
    expect(screen.queryByText('Stone Cold (John)')).not.toBeInTheDocument();
    expect(screen.queryByText('Unlinked Guy (NoLink)')).not.toBeInTheDocument();
  });

  it('populates match type and stipulation dropdowns from API', async () => {
    renderIssue();

    await waitFor(() => {
      expect(screen.getByText('Issue a Challenge')).toBeInTheDocument();
    });

    // Wait for API-driven dropdowns to populate
    // Now selects are [matchType, stipulation] — opponents is a checkbox group
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      const matchTypeSelect = selects[0]!;
      const matchOptions = Array.from(matchTypeSelect.querySelectorAll('option')).map((o) => o.textContent);
      expect(matchOptions).toContain('Singles');
      expect(matchOptions).toContain('Tag Team');
      expect(matchOptions).toContain('Battle Royal');
    });

    const selects = screen.getAllByRole('combobox');
    const stipSelect = selects[1]!;
    const stipOptions = Array.from(stipSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(stipOptions).toContain('None');
    expect(stipOptions).toContain('Steel Cage');
    expect(stipOptions).toContain('Ladder');
  });

  it('enforces 200 character challenge note limit with counter display', async () => {
    const user = userEvent.setup();
    renderIssue();

    await waitFor(() => {
      expect(screen.getByText('Issue a Challenge')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText('Add a short note (optional)');
    const longText = 'A'.repeat(200);
    await user.type(textarea, longText);

    expect(screen.getByText('200/200')).toBeInTheDocument();
  });

  it('submits successfully with opponentIds[]', async () => {
    const user = userEvent.setup();
    mockCreateChallenge.mockResolvedValue({});

    renderIssue();

    await waitFor(() => {
      expect(screen.getByText('Issue a Challenge')).toBeInTheDocument();
    });

    // Check opponent p-2
    const opponentCheckbox = screen.getByLabelText('The Rock (Jane)');
    await user.click(opponentCheckbox);

    // Select match type
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0]!, 'Singles');

    // Submit
    await user.click(screen.getByText('Submit Challenge'));

    await waitFor(() => {
      expect(mockCreateChallenge).toHaveBeenCalledWith({
        opponentIds: ['p-2'],
        matchType: 'Singles',
        stipulation: undefined,
        championshipId: undefined,
        challengeNote: undefined,
      });
    });

    // Success screen
    await waitFor(() => {
      expect(screen.getByText('Challenge issued successfully!')).toBeInTheDocument();
    });
  });
});
