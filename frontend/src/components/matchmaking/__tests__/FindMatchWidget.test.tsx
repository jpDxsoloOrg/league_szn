import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  InvitationListResponse,
  MatchInvitation,
  QueueEntry,
} from '../../../types/matchmaking';

// --- Hoisted mocks ---
const {
  mockNavigate,
  mockEnablePresence,
  mockDisablePresence,
  authState,
  presenceState,
  mockGetInvitations,
  mockGetQueue,
  mockCreateInvitation,
  mockJoinQueue,
  mockLeaveQueue,
  mockGetStipulations,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockEnablePresence: vi.fn(),
  mockDisablePresence: vi.fn(),
  authState: {
    isWrestler: true as boolean,
    playerId: 'me' as string | null,
  },
  presenceState: {
    presenceEnabled: false as boolean,
  },
  mockGetInvitations: vi.fn(),
  mockGetQueue: vi.fn(),
  mockCreateInvitation: vi.fn(),
  mockJoinQueue: vi.fn(),
  mockLeaveQueue: vi.fn(),
  mockGetStipulations: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; ago?: string }) => {
      if (options?.count != null) return `${key}:${options.count}`;
      if (options?.ago != null) return `${key}:${options.ago}`;
      return key;
    },
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../../../contexts/PresenceContext', () => ({
  usePresence: () => ({
    presenceEnabled: presenceState.presenceEnabled,
    enablePresence: mockEnablePresence,
    disablePresence: mockDisablePresence,
    lastHeartbeatAt: null,
  }),
}));

vi.mock('../../../services/api/matchmaking.api', () => ({
  matchmakingApi: {
    heartbeat: vi.fn(),
    leavePresence: vi.fn(),
    joinQueue: mockJoinQueue,
    leaveQueue: mockLeaveQueue,
    getQueue: mockGetQueue,
    getOnline: vi.fn(),
    createInvitation: mockCreateInvitation,
    getInvitations: mockGetInvitations,
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
  },
}));

vi.mock('../../../services/api/stipulations.api', () => ({
  stipulationsApi: {
    getAll: mockGetStipulations,
  },
}));

vi.mock('../FindMatchWidget.css', () => ({}));

import FindMatchWidget from '../FindMatchWidget';

const futureIso = (): string => new Date(Date.now() + 60_000).toISOString();

const makeInvitation = (id: string): MatchInvitation => ({
  invitationId: id,
  fromPlayerId: 'them',
  toPlayerId: 'me',
  status: 'pending',
  createdAt: new Date().toISOString(),
  expiresAt: futureIso(),
  from: { playerId: 'them', name: 'Them', currentWrestler: 'Them-W' },
  to: { playerId: 'me', name: 'Me', currentWrestler: 'Me-W' },
});

const makeQueueEntry = (
  playerId: string,
  name: string,
  currentWrestler: string
): QueueEntry => ({
  playerId,
  name,
  currentWrestler,
  preferences: {},
  joinedAt: new Date().toISOString(),
});

const emptyInvitations: InvitationListResponse = { incoming: [], outgoing: [] };

describe('FindMatchWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isWrestler = true;
    authState.playerId = 'me';
    presenceState.presenceEnabled = false;
    mockGetInvitations.mockResolvedValue(emptyInvitations);
    mockGetQueue.mockResolvedValue([]);
    mockGetStipulations.mockResolvedValue([]);
  });

  it('renders nothing when not a wrestler', () => {
    authState.isWrestler = false;
    const { container } = render(<FindMatchWidget />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when playerId is null', () => {
    authState.playerId = null;
    const { container } = render(<FindMatchWidget />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render a presence toggle (join queue handles presence)', async () => {
    render(<FindMatchWidget />);
    await waitFor(() => {
      expect(screen.getByText('findMatch.widget.empty')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'findMatch.appearOnline.on' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'findMatch.appearOnline.off' })
    ).not.toBeInTheDocument();
  });

  it('shows pending invitation badge after getInvitations resolves', async () => {
    mockGetInvitations.mockResolvedValue({
      incoming: [makeInvitation('a'), makeInvitation('b'), makeInvitation('c')],
      outgoing: [],
    });
    render(<FindMatchWidget />);

    await waitFor(() => {
      expect(
        screen.getByText('findMatch.widget.pendingCount:3')
      ).toBeInTheDocument();
    });
  });

  it('renders empty state when the queue is empty', async () => {
    render(<FindMatchWidget />);

    await waitFor(() => {
      expect(screen.getByText('findMatch.widget.empty')).toBeInTheDocument();
    });
    expect(screen.getByText('findMatch.widget.emptyHint')).toBeInTheDocument();
  });

  it('renders all queue entries including self with a You badge and no challenge button', async () => {
    mockGetQueue.mockResolvedValue([
      makeQueueEntry('me', 'Me', 'My-Wrestler'),
      makeQueueEntry('p1', 'Mike R.', 'STONE COLD STEVE AUSTIN'),
      makeQueueEntry('p2', 'Jane D.', 'THE UNDERTAKER'),
    ]);

    render(<FindMatchWidget />);

    await waitFor(() => {
      expect(screen.getByText('STONE COLD STEVE AUSTIN')).toBeInTheDocument();
    });
    expect(screen.getByText('THE UNDERTAKER')).toBeInTheDocument();
    // Self is now shown in the queue
    expect(screen.getByText('My-Wrestler')).toBeInTheDocument();
    expect(screen.getByText('findMatch.widget.you')).toBeInTheDocument();
    // Only the two other players should have a Challenge button (self doesn't)
    const challengeButtons = screen.getAllByRole('button', {
      name: 'findMatch.widget.challenge',
    });
    expect(challengeButtons).toHaveLength(2);
  });

  it('challenge button calls createInvitation with the target player id', async () => {
    const user = userEvent.setup();
    mockGetQueue.mockResolvedValue([
      makeQueueEntry('p1', 'Mike R.', 'STONE COLD STEVE AUSTIN'),
    ]);
    mockCreateInvitation.mockResolvedValue({});

    render(<FindMatchWidget />);

    const challengeBtn = await screen.findByRole('button', {
      name: 'findMatch.widget.challenge',
    });
    await user.click(challengeBtn);

    expect(mockCreateInvitation).toHaveBeenCalledWith('p1', {});
  });

  it('CTA auto-enables presence and joins queue when presence is off', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = false;
    mockEnablePresence.mockResolvedValue(undefined);
    mockJoinQueue.mockResolvedValue({ status: 'queued' });

    render(<FindMatchWidget />);

    const cta = await screen.findByRole('button', {
      name: 'findMatch.widget.joinQueue',
    });
    await user.click(cta);
    expect(mockEnablePresence).toHaveBeenCalledTimes(1);
    expect(mockJoinQueue).toHaveBeenCalledWith({});
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('CTA calls joinQueue when presence is on and user is not in queue', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = true;
    mockJoinQueue.mockResolvedValue({ status: 'queued' });

    render(<FindMatchWidget />);

    const cta = await screen.findByRole('button', {
      name: 'findMatch.widget.joinQueue',
    });
    await user.click(cta);
    expect(mockJoinQueue).toHaveBeenCalledWith({});
  });

  it('CTA shows leave label and calls leaveQueue when user is already in queue', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = true;
    mockGetQueue.mockResolvedValue([
      makeQueueEntry('me', 'Me', 'My-Wrestler'),
    ]);
    mockLeaveQueue.mockResolvedValue(undefined);

    render(<FindMatchWidget />);

    const cta = await screen.findByRole('button', {
      name: 'findMatch.widget.leaveQueue',
    });
    await user.click(cta);
    expect(mockLeaveQueue).toHaveBeenCalledTimes(1);
  });
});
