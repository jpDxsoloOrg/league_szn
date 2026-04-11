import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  InvitationListResponse,
  JoinQueueResponse,
  MatchInvitation,
  OnlinePlayer,
  QueueEntry,
} from '../../../types/matchmaking';

// --- Hoisted mocks ---
const {
  mockNavigate,
  mockEnablePresence,
  mockDisablePresence,
  authState,
  presenceState,
  mockHeartbeat,
  mockLeavePresence,
  mockJoinQueue,
  mockLeaveQueue,
  mockGetQueue,
  mockGetOnline,
  mockCreateInvitation,
  mockGetInvitations,
  mockAcceptInvitation,
  mockDeclineInvitation,
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
  mockHeartbeat: vi.fn(),
  mockLeavePresence: vi.fn(),
  mockJoinQueue: vi.fn(),
  mockLeaveQueue: vi.fn(),
  mockGetQueue: vi.fn(),
  mockGetOnline: vi.fn(),
  mockCreateInvitation: vi.fn(),
  mockGetInvitations: vi.fn(),
  mockAcceptInvitation: vi.fn(),
  mockDeclineInvitation: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; seconds?: number }) => {
      if (options?.count != null) return `${key}:${options.count}`;
      if (options?.seconds != null) return `${key}:${options.seconds}`;
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
    heartbeat: mockHeartbeat,
    leavePresence: mockLeavePresence,
    joinQueue: mockJoinQueue,
    leaveQueue: mockLeaveQueue,
    getQueue: mockGetQueue,
    getOnline: mockGetOnline,
    createInvitation: mockCreateInvitation,
    getInvitations: mockGetInvitations,
    acceptInvitation: mockAcceptInvitation,
    declineInvitation: mockDeclineInvitation,
  },
}));

vi.mock('../FindMatchPage.css', () => ({}));

import FindMatchPage from '../FindMatchPage';

const futureIso = (): string => new Date(Date.now() + 60_000).toISOString();

const makeInvitation = (id: string, fromId: string, toId: string): MatchInvitation => ({
  invitationId: id,
  fromPlayerId: fromId,
  toPlayerId: toId,
  status: 'pending',
  createdAt: new Date().toISOString(),
  expiresAt: futureIso(),
  from: { playerId: fromId, name: `${fromId}-name`, currentWrestler: `${fromId}-wrestler` },
  to: { playerId: toId, name: `${toId}-name`, currentWrestler: `${toId}-wrestler` },
});

const emptyInvitations: InvitationListResponse = { incoming: [], outgoing: [] };
const emptyQueue: QueueEntry[] = [];
const emptyOnline: OnlinePlayer[] = [];

const onlinePlayer: OnlinePlayer = {
  playerId: 'target-1',
  name: 'Target One',
  currentWrestler: 'The Target',
  lastSeenAt: new Date().toISOString(),
  inQueue: false,
};

describe('FindMatchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isWrestler = true;
    authState.playerId = 'me';
    presenceState.presenceEnabled = false;
    mockGetQueue.mockResolvedValue(emptyQueue);
    mockGetOnline.mockResolvedValue(emptyOnline);
    mockGetInvitations.mockResolvedValue(emptyInvitations);
  });

  it('renders wrestler-only notice when isWrestler is false', () => {
    authState.isWrestler = false;
    render(<FindMatchPage />);
    expect(screen.getByText('findMatch.needsWrestler')).toBeInTheDocument();
  });

  it('renders wrestler-only notice when playerId is null', () => {
    authState.playerId = null;
    render(<FindMatchPage />);
    expect(screen.getByText('findMatch.needsWrestler')).toBeInTheDocument();
  });

  it('presence toggle calls enablePresence when currently off', async () => {
    const user = userEvent.setup();
    mockEnablePresence.mockResolvedValue(undefined);
    render(<FindMatchPage />);
    // When off, the toggle button label is `findMatch.appearOnline.on`.
    const buttons = screen.getAllByRole('button', { name: 'findMatch.appearOnline.on' });
    // The presence toggle button has class btn-presence; just pick the first one (only one button with this label exists in idle state).
    await user.click(buttons[0]);
    expect(mockEnablePresence).toHaveBeenCalledTimes(1);
  });

  it('presence toggle calls disablePresence when currently on', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = true;
    mockDisablePresence.mockResolvedValue(undefined);
    render(<FindMatchPage />);
    // When on, toggle button label is `findMatch.appearOnline.off`.
    const toggle = screen.getByRole('button', { name: 'findMatch.appearOnline.off' });
    await user.click(toggle);
    expect(mockDisablePresence).toHaveBeenCalledTimes(1);
  });

  it('join queue button calls joinQueue with current preferences', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = true;
    const joinResp: JoinQueueResponse = { status: 'queued' };
    mockJoinQueue.mockResolvedValue(joinResp);
    render(<FindMatchPage />);

    const joinBtn = screen.getByRole('button', { name: 'findMatch.queue.join' });
    await user.click(joinBtn);

    await waitFor(() => {
      expect(mockJoinQueue).toHaveBeenCalledTimes(1);
    });
    expect(mockJoinQueue).toHaveBeenCalledWith({});
  });

  it('shows matched state with matchId when joinQueue returns matched', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = true;
    mockJoinQueue.mockResolvedValue({
      status: 'matched',
      matchId: 'match-xyz',
      opponent: { playerId: 'opp', name: 'Opp' },
    } satisfies JoinQueueResponse);

    render(<FindMatchPage />);
    await user.click(screen.getByRole('button', { name: 'findMatch.queue.join' }));

    await waitFor(() => {
      // "matched" label appears both as text and as a button label.
      const matched = screen.getAllByText('findMatch.queue.matched');
      expect(matched.length).toBeGreaterThan(0);
    });

    // The matched button navigates; its presence implies matchedMatchId is set.
    const matchedBtn = screen.getByRole('button', { name: 'findMatch.queue.matched' });
    await user.click(matchedBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/matches', {
      state: { matchId: 'match-xyz' },
    });
  });

  it('leave queue button calls leaveQueue', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = true;
    mockJoinQueue.mockResolvedValue({ status: 'queued' } satisfies JoinQueueResponse);
    mockLeaveQueue.mockResolvedValue(undefined);
    // After joining, the refresh call should see us in the queue so the status
    // sync doesn't flip us back to idle.
    mockGetQueue.mockResolvedValue([
      {
        playerId: 'me',
        name: 'Me',
        currentWrestler: 'Me-Wrestler',
        preferences: {},
        joinedAt: new Date().toISOString(),
      },
    ] satisfies QueueEntry[]);

    render(<FindMatchPage />);
    await user.click(screen.getByRole('button', { name: 'findMatch.queue.join' }));

    const leaveBtn = await screen.findByRole('button', {
      name: 'findMatch.queue.leave',
    });
    await user.click(leaveBtn);
    expect(mockLeaveQueue).toHaveBeenCalledTimes(1);
  });

  it('invite button calls createInvitation with target playerId', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = true;
    mockGetOnline.mockResolvedValue([onlinePlayer]);
    mockCreateInvitation.mockResolvedValue(
      makeInvitation('inv-new', 'me', 'target-1')
    );

    render(<FindMatchPage />);

    const inviteBtn = await screen.findByRole('button', {
      name: 'findMatch.online.invite',
    });
    await user.click(inviteBtn);

    await waitFor(() => {
      expect(mockCreateInvitation).toHaveBeenCalledWith('target-1', {});
    });
  });

  it('accept on incoming invitation calls acceptInvitation', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = true;
    const inv = makeInvitation('inv-1', 'them', 'me');
    mockGetInvitations.mockResolvedValue({ incoming: [inv], outgoing: [] });
    mockAcceptInvitation.mockResolvedValue({
      matchId: 'm-accepted',
      invitation: inv,
    });

    render(<FindMatchPage />);

    const acceptBtn = await screen.findByRole('button', {
      name: 'findMatch.invitations.accept',
    });
    await user.click(acceptBtn);

    await waitFor(() => {
      expect(mockAcceptInvitation).toHaveBeenCalledWith('inv-1');
    });
  });

  it('decline on incoming invitation calls declineInvitation and removes it', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = true;
    const inv = makeInvitation('inv-dec', 'them', 'me');
    mockGetInvitations.mockResolvedValue({ incoming: [inv], outgoing: [] });
    mockDeclineInvitation.mockResolvedValue(undefined);

    render(<FindMatchPage />);

    const declineBtn = await screen.findByRole('button', {
      name: 'findMatch.invitations.decline',
    });
    await user.click(declineBtn);

    await waitFor(() => {
      expect(mockDeclineInvitation).toHaveBeenCalledWith('inv-dec');
    });

    // After decline, the accept button (tied to that card) should be gone.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'findMatch.invitations.accept' })
      ).not.toBeInTheDocument();
    });
  });
});
