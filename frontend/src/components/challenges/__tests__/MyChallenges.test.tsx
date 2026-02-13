import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import type { ChallengeWithPlayers } from '../../../types/challenge';

// --- Hoisted mocks ---
const { mockGetAll, mockRespond, mockCancelChallenge, mockGetMyProfile, mockNavigate } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockRespond: vi.fn(),
  mockCancelChallenge: vi.fn(),
  mockGetMyProfile: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  challengesApi: {
    getAll: mockGetAll,
    respond: mockRespond,
    cancel: mockCancelChallenge,
  },
  profileApi: { getMyProfile: mockGetMyProfile },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      const t: Record<string, string> = {
        'challenges.my.title': 'My Challenges',
        'challenges.my.received': 'Received',
        'challenges.my.sent': 'Sent',
        'challenges.my.noReceived': 'No received challenges',
        'challenges.my.noSent': 'No sent challenges',
        'challenges.my.viewDetails': 'View Details',
        'challenges.my.response': 'Response',
        'challenges.detail.accept': 'Accept',
        'challenges.detail.decline': 'Decline',
        'challenges.detail.counter': 'Counter',
        'challenges.detail.backToBoard': 'Back to Board',
        'challenges.board.issueChallenge': 'Issue Challenge',
        'challenges.status.pending': 'Pending',
        'challenges.status.accepted': 'Accepted',
        'common.cancel': 'Cancel',
        'common.loading': 'Loading...',
      };
      if (key === 'challenges.my.actionFeedback' && opts) {
        return `${opts.action} challenge vs ${opts.opponent}`;
      }
      return t[key] || key;
    },
  }),
}));

vi.mock('../MyChallenges.css', () => ({}));

import MyChallenges from '../MyChallenges';

const currentPlayerId = 'p-1';

function makeChallenge(overrides: Partial<ChallengeWithPlayers> = {}): ChallengeWithPlayers {
  return {
    challengeId: 'ch-1',
    challengerId: 'p-1',
    challengedId: 'p-2',
    matchType: 'Singles',
    status: 'pending',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    challenger: { playerName: 'John', wrestlerName: 'Stone Cold' },
    challenged: { playerName: 'Jane', wrestlerName: 'The Rock' },
    ...overrides,
  };
}

function renderMyChallenges() {
  return render(
    <BrowserRouter>
      <MyChallenges />
    </BrowserRouter>
  );
}

describe('MyChallenges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMyProfile.mockResolvedValue({ playerId: currentPlayerId });
  });

  it('shows received and sent challenge tabs with counts', async () => {
    const challenges = [
      makeChallenge({ challengeId: 'ch-sent', challengerId: 'p-1', challengedId: 'p-2' }),
      makeChallenge({
        challengeId: 'ch-recv',
        challengerId: 'p-3',
        challengedId: 'p-1',
        challenger: { playerName: 'Al', wrestlerName: 'Undertaker' },
        challenged: { playerName: 'John', wrestlerName: 'Stone Cold' },
      }),
    ];
    mockGetAll.mockResolvedValue(challenges);

    renderMyChallenges();

    await waitFor(() => {
      expect(screen.getByText('Received')).toBeInTheDocument();
    });

    expect(screen.getByText('Sent')).toBeInTheDocument();

    // Received tab count (1) and Sent tab count (1)
    const counts = screen.getAllByText('1');
    expect(counts.length).toBeGreaterThanOrEqual(2);
  });

  it('shows action buttons based on status and direction', async () => {
    const receivedPending = makeChallenge({
      challengeId: 'ch-recv',
      challengerId: 'p-2',
      challengedId: 'p-1',
      challenger: { playerName: 'Jane', wrestlerName: 'The Rock' },
      challenged: { playerName: 'John', wrestlerName: 'Stone Cold' },
    });
    mockGetAll.mockResolvedValue([receivedPending]);

    renderMyChallenges();

    // Default tab is "Received"
    await waitFor(() => {
      expect(screen.getByText('Accept')).toBeInTheDocument();
    });
    expect(screen.getByText('Decline')).toBeInTheDocument();
    expect(screen.getByText('Counter')).toBeInTheDocument();
  });

  it('shows cancel button for sent pending challenges', async () => {
    const user = userEvent.setup();
    const sentPending = makeChallenge({
      challengeId: 'ch-sent',
      challengerId: 'p-1',
      challengedId: 'p-2',
    });
    mockGetAll.mockResolvedValue([sentPending]);

    renderMyChallenges();

    await waitFor(() => {
      expect(screen.getByText('My Challenges')).toBeInTheDocument();
    });

    // Switch to Sent tab
    await user.click(screen.getByText('Sent'));

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    // Accept/Decline should NOT appear on sent challenges
    expect(screen.queryByText('Accept')).not.toBeInTheDocument();
    expect(screen.queryByText('Decline')).not.toBeInTheDocument();
  });
});
