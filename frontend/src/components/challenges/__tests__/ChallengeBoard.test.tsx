import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import type { ChallengeWithPlayers } from '../../../types/challenge';

// --- Hoisted mocks ---
const { mockGetAll } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  challengesApi: { getAll: mockGetAll },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const t: Record<string, string> = {
        'challenges.board.title': 'Challenge Board',
        'challenges.board.myChallenges': 'My Challenges',
        'challenges.board.issueChallenge': 'Issue Challenge',
        'challenges.board.filterActive': 'Active',
        'challenges.board.filterPending': 'Pending',
        'challenges.board.filterAccepted': 'Accepted',
        'challenges.board.filterRecent': 'Recent',
        'challenges.board.noChallenges': 'No challenges found',
        'challenges.board.remaining': 'remaining',
        'challenges.board.titleMatch': 'Title Match',
        'challenges.status.pending': 'Pending',
        'challenges.status.accepted': 'Accepted',
        'challenges.status.declined': 'Declined',
        'common.days': 'days',
        'common.vs': 'vs',
      };
      return t[key] || key;
    },
  }),
}));

vi.mock('../ChallengeBoard.css', () => ({}));

import ChallengeBoard from '../ChallengeBoard';

function makeChallenge(overrides: Partial<ChallengeWithPlayers> = {}): ChallengeWithPlayers {
  return {
    challengeId: 'ch-1',
    challengerId: 'p-1',
    challengedId: 'p-2',
    matchType: 'Singles',
    status: 'pending',
    message: 'Bring it!',
    expiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    challenger: { playerName: 'John', wrestlerName: 'Stone Cold' },
    challenged: { playerName: 'Jane', wrestlerName: 'The Rock' },
    ...overrides,
  };
}

function renderBoard() {
  return render(
    <BrowserRouter>
      <ChallengeBoard />
    </BrowserRouter>
  );
}

describe('ChallengeBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders challenge list and filter tabs after loading', async () => {
    const challenges = [
      makeChallenge(),
      makeChallenge({
        challengeId: 'ch-2',
        status: 'accepted',
        matchType: 'Tag Team',
        challenger: { playerName: 'Al', wrestlerName: 'Undertaker' },
        challenged: { playerName: 'Bob', wrestlerName: 'Kane' },
      }),
    ];
    mockGetAll.mockResolvedValue(challenges);

    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('Challenge Board')).toBeInTheDocument();
    });

    // Filter tab buttons rendered
    const filterButtons = screen.getAllByRole('button');
    const filterTexts = filterButtons.map((b) => b.textContent);
    expect(filterTexts).toContain('Active');
    expect(filterTexts).toContain('Pending');
    expect(filterTexts).toContain('Accepted');
    expect(filterTexts).toContain('Recent');

    // Both challenges shown in "Active" (pending + accepted are active)
    expect(screen.getByText('Stone Cold')).toBeInTheDocument();
    expect(screen.getByText('Undertaker')).toBeInTheDocument();
  });

  it('filters challenges by tab selection', async () => {
    const user = userEvent.setup();
    const challenges = [
      makeChallenge({ challengeId: 'ch-1', status: 'pending' }),
      makeChallenge({
        challengeId: 'ch-2',
        status: 'declined',
        challenger: { playerName: 'Al', wrestlerName: 'Undertaker' },
        challenged: { playerName: 'Bob', wrestlerName: 'Kane' },
      }),
    ];
    mockGetAll.mockResolvedValue(challenges);

    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('Stone Cold')).toBeInTheDocument();
    });

    // Declined challenge should not appear in Active (default)
    expect(screen.queryByText('Undertaker')).not.toBeInTheDocument();

    // Click "Recent" to see declined
    await user.click(screen.getByText('Recent'));
    expect(screen.getByText('Undertaker')).toBeInTheDocument();
    // Pending challenge should not appear in Recent
    expect(screen.queryByText('Stone Cold')).not.toBeInTheDocument();
  });

  it('shows countdown for pending challenges', async () => {
    const challenges = [
      makeChallenge({
        status: 'pending',
        expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      }),
    ];
    mockGetAll.mockResolvedValue(challenges);

    renderBoard();

    await waitFor(() => {
      expect(screen.getByText(/days remaining/i)).toBeInTheDocument();
    });
  });

  it('handles empty state with issue challenge link', async () => {
    mockGetAll.mockResolvedValue([]);

    renderBoard();

    await waitFor(() => {
      expect(screen.getByText('No challenges found')).toBeInTheDocument();
    });

    // "Issue Challenge" link should be available in the empty state
    const issueLinks = screen.getAllByText('Issue Challenge');
    expect(issueLinks.length).toBeGreaterThanOrEqual(1);
  });
});
