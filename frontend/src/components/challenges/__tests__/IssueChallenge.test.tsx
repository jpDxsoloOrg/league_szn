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

  it('renders the form with opponent, match type, stipulation, and message fields', async () => {
    renderIssue();

    await waitFor(() => {
      expect(screen.getByText('Issue a Challenge')).toBeInTheDocument();
    });

    expect(screen.getByText('Select Opponent')).toBeInTheDocument();
    expect(screen.getByText('Match Type')).toBeInTheDocument();
    expect(screen.getByText('Stipulation')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('Submit Challenge')).toBeInTheDocument();
  });

  it('filters opponents to only linked users, excluding self', async () => {
    renderIssue();

    await waitFor(() => {
      expect(screen.getByText('Issue a Challenge')).toBeInTheDocument();
    });

    // The opponent dropdown should contain "The Rock (Jane)" but NOT self or unlinked
    const opponentSelect = screen.getAllByRole('combobox')[0]!;
    const options = Array.from(opponentSelect.querySelectorAll('option'));
    const optionTexts = options.map((o) => o.textContent);

    // Should have placeholder + Jane (linked, not self)
    expect(optionTexts).toContain('The Rock (Jane)');
    // Should NOT have self
    expect(optionTexts).not.toContain('Stone Cold (John)');
    // Should NOT have unlinked player
    expect(optionTexts).not.toContain('Unlinked Guy (NoLink)');
  });

  it('populates match type and stipulation dropdowns from API', async () => {
    renderIssue();

    await waitFor(() => {
      expect(screen.getByText('Issue a Challenge')).toBeInTheDocument();
    });

    // Wait for API-driven dropdowns to populate
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      const matchTypeSelect = selects[1]!;
      const matchOptions = Array.from(matchTypeSelect.querySelectorAll('option')).map((o) => o.textContent);
      expect(matchOptions).toContain('Singles');
      expect(matchOptions).toContain('Tag Team');
      expect(matchOptions).toContain('Battle Royal');
    });

    const selects = screen.getAllByRole('combobox');
    const stipSelect = selects[2]!;
    const stipOptions = Array.from(stipSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(stipOptions).toContain('None');
    expect(stipOptions).toContain('Steel Cage');
    expect(stipOptions).toContain('Ladder');
  });

  it('enforces 500 character message limit with counter display', async () => {
    const user = userEvent.setup();
    renderIssue();

    await waitFor(() => {
      expect(screen.getByText('Issue a Challenge')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText('Say something...');
    const longText = 'A'.repeat(500);
    await user.type(textarea, longText);

    expect(screen.getByText('500/500')).toBeInTheDocument();
  });

  it('shows preview and submits successfully', async () => {
    const user = userEvent.setup();
    mockCreateChallenge.mockResolvedValue({});

    renderIssue();

    await waitFor(() => {
      expect(screen.getByText('Issue a Challenge')).toBeInTheDocument();
    });

    // Fill form
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0]!, 'p-2');
    await user.selectOptions(selects[1]!, 'Singles');

    // Preview toggle should appear when form is valid
    await waitFor(() => {
      expect(screen.getByText('Show Preview')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Show Preview'));
    expect(screen.getByText('Preview')).toBeInTheDocument();

    // Submit
    await user.click(screen.getByText('Submit Challenge'));

    await waitFor(() => {
      expect(mockCreateChallenge).toHaveBeenCalledWith({
        challengedId: 'p-2',
        matchType: 'Singles',
        stipulation: undefined,
        championshipId: undefined,
        message: undefined,
      });
    });

    // Success screen
    await waitFor(() => {
      expect(screen.getByText('Challenge issued successfully!')).toBeInTheDocument();
    });
  });
});
