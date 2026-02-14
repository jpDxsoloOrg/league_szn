import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import type { ChallengeWithPlayers } from '../../../types/challenge';

// --- Hoisted mocks ---
const { mockGetById, mockRespond, mockCancel, mockGetMyProfile } = vi.hoisted(() => ({
  mockGetById: vi.fn(),
  mockRespond: vi.fn(),
  mockCancel: vi.fn(),
  mockGetMyProfile: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  challengesApi: {
    getById: mockGetById,
    respond: mockRespond,
    cancel: mockCancel,
  },
  profileApi: { getMyProfile: mockGetMyProfile },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ challengeId: 'ch-1' }),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      const t: Record<string, string> = {
        'challenges.detail.backToBoard': 'Back to Challenges',
        'challenges.detail.notFound': 'Challenge not found',
        'challenges.detail.challenger': 'Challenger',
        'challenges.detail.challenged': 'Challenged',
        'challenges.detail.messages': 'Messages',
        'challenges.detail.status': 'Status',
        'challenges.detail.created': 'Created',
        'challenges.detail.expires': 'Expires',
        'challenges.detail.matchType': 'Match Type',
        'challenges.detail.accept': 'Accept',
        'challenges.detail.decline': 'Decline',
        'challenges.detail.counter': 'Counter',
        'challenges.detail.cancel': 'Cancel Challenge',
        'challenges.detail.counterChallenge': 'Counter Challenge',
        'challenges.detail.viewScheduledMatch': 'View Scheduled Match',
        'challenges.board.titleMatch': 'Title Match',
        'challenges.status.pending': 'Pending',
        'challenges.status.accepted': 'Accepted',
        'challenges.issue.matchType': 'Match Type',
        'challenges.issue.selectMatchType': '-- Select Match Type --',
        'challenges.issue.stipulation': 'Stipulation',
        'challenges.issue.message': 'Message',
        'challenges.issue.messagePlaceholder': 'Say something...',
        'challenges.issue.submit': 'Submit',
        'common.loading': 'Loading...',
        'common.cancel': 'Cancel',
        'common.submitting': 'Submitting...',
        'common.vs': 'vs',
      };
      if (key === 'challenges.detail.actionConfirmed' && opts?.action) {
        return `Action ${opts.action} confirmed`;
      }
      return t[key] || key;
    },
  }),
}));

vi.mock('../ChallengeDetail.css', () => ({}));

import ChallengeDetail from '../ChallengeDetail';

const pendingChallenge: ChallengeWithPlayers = {
  challengeId: 'ch-1',
  challengerId: 'p-1',
  challengedId: 'p-2',
  matchType: 'Singles',
  stipulation: 'Steel Cage',
  status: 'pending',
  message: 'You are going down!',
  expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
  createdAt: '2024-06-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
  challenger: { playerName: 'John', wrestlerName: 'Stone Cold' },
  challenged: { playerName: 'Jane', wrestlerName: 'The Rock' },
};

function renderDetail() {
  return render(
    <BrowserRouter>
      <ChallengeDetail />
    </BrowserRouter>
  );
}

describe('ChallengeDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders challenge details: match type, stipulation, players, message', async () => {
    mockGetById.mockResolvedValue(pendingChallenge);
    mockGetMyProfile.mockResolvedValue({ playerId: 'p-3' }); // observer

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Singles')).toBeInTheDocument();
    });

    expect(screen.getByText('Steel Cage')).toBeInTheDocument();
    expect(screen.getByText('Stone Cold')).toBeInTheDocument();
    expect(screen.getByText('The Rock')).toBeInTheDocument();
    expect(screen.getByText('Challenger')).toBeInTheDocument();
    expect(screen.getByText('Challenged')).toBeInTheDocument();
  });

  it('shows accept, decline, counter buttons for the challenged player on pending', async () => {
    mockGetById.mockResolvedValue(pendingChallenge);
    mockGetMyProfile.mockResolvedValue({ playerId: 'p-2' }); // challenged

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Accept')).toBeInTheDocument();
    });

    expect(screen.getByText('Decline')).toBeInTheDocument();
    expect(screen.getByText('Counter')).toBeInTheDocument();
    // Should NOT show cancel (only issuer sees that)
    expect(screen.queryByText('Cancel Challenge')).not.toBeInTheDocument();
  });

  it('shows cancel button for the issuer on pending challenges', async () => {
    mockGetById.mockResolvedValue(pendingChallenge);
    mockGetMyProfile.mockResolvedValue({ playerId: 'p-1' }); // challenger

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Cancel Challenge')).toBeInTheDocument();
    });

    // Should NOT show accept/decline (only challenged sees those)
    expect(screen.queryByText('Accept')).not.toBeInTheDocument();
    expect(screen.queryByText('Decline')).not.toBeInTheDocument();
  });

  it('calls respond API when accept is clicked and refreshes', async () => {
    const user = userEvent.setup();
    const acceptedChallenge = { ...pendingChallenge, status: 'accepted' as const };
    mockGetById
      .mockResolvedValueOnce(pendingChallenge) // initial load
      .mockResolvedValueOnce(acceptedChallenge); // after accept refresh
    mockGetMyProfile.mockResolvedValue({ playerId: 'p-2' });
    mockRespond.mockResolvedValue(acceptedChallenge);

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Accept')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Accept'));

    await waitFor(() => {
      expect(mockRespond).toHaveBeenCalledWith('ch-1', 'accept');
    });
  });
});
