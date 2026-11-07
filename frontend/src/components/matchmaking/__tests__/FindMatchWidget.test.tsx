import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Player } from '../../../types';
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
  mockAcceptInvitation,
  mockDeclineInvitation,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockEnablePresence: vi.fn(),
  mockDisablePresence: vi.fn(),
  authState: {
    isWrestler: true as boolean,
    playerId: 'me' as string | null,
    currentWrestler: 'My-Wrestler' as string | null,
    profile: null as Pick<Player, 'discipline'> | null,
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
  mockAcceptInvitation: vi.fn(),
  mockDeclineInvitation: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
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
    acceptInvitation: mockAcceptInvitation,
    declineInvitation: mockDeclineInvitation,
  },
}));

vi.mock('../../../services/api/stipulations.api', () => ({
  stipulationsApi: {
    getAll: mockGetStipulations,
  },
}));

vi.mock('../FindMatchWidget.css', () => ({}));

import FindMatchWidget from '../FindMatchWidget';
import { ApiError } from '../../../services/api/apiClient';

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
    authState.currentWrestler = 'My-Wrestler';
    presenceState.presenceEnabled = false;
    mockGetInvitations.mockResolvedValue(emptyInvitations);
    mockGetQueue.mockResolvedValue([]);
    mockGetStipulations.mockResolvedValue([]);
  });

  describe('while blocked from signing up', () => {
    beforeEach(() => {
      authState.profile = {
        discipline: {
          status: 'signup-blocked',
          activeStrikeCount: 2,
          activeStrikes: [],
          cooldownEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          signupBlockedUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          deactivatedAt: null,
        },
      };
    });

    afterEach(() => {
      authState.profile = null;
    });

    it('turns off join, challenge and accept, keeps decline, and shows the end', async () => {
      mockGetInvitations.mockResolvedValue({ incoming: [makeInvitation('inv-1')], outgoing: [] });
      mockGetQueue.mockResolvedValue([makeQueueEntry('them', 'Them', 'Their Wrestler')]);
      render(<MemoryRouter><FindMatchWidget /></MemoryRouter>);

      expect(await screen.findByRole('button', { name: 'findMatch.widget.challenge' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'findMatch.widget.joinQueue' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'findMatch.invitations.accept' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'findMatch.invitations.decline' })).toBeEnabled();
      expect(screen.getByRole('timer')).toBeInTheDocument();
    });

    it('still lets a player already in the queue leave it', async () => {
      mockGetQueue.mockResolvedValue([makeQueueEntry('me', 'Me', 'My-Wrestler')]);
      render(<MemoryRouter><FindMatchWidget /></MemoryRouter>);

      expect(await screen.findByRole('button', { name: 'findMatch.widget.leaveQueue' })).toBeEnabled();
    });
  });

  it('shows a refusal in place of the generic failure', async () => {
    mockGetQueue.mockResolvedValue([]);
    mockJoinQueue.mockRejectedValue(new ApiError('Translated refusal', 403, { code: 'SIGNUP_BLOCKED' }));
    presenceState.presenceEnabled = true;
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<MemoryRouter><FindMatchWidget /></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: 'findMatch.widget.joinQueue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Translated refusal');
    consoleError.mockRestore();
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

  it('renders incoming challenge cards with Accept and Decline buttons', async () => {
    mockGetInvitations.mockResolvedValue({
      incoming: [makeInvitation('inv-1')],
      outgoing: [],
    });
    render(<FindMatchWidget />);

    await waitFor(() => {
      expect(
        screen.getByText('findMatch.widget.incomingHeader')
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: 'findMatch.invitations.accept' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'findMatch.invitations.decline' })
    ).toBeInTheDocument();
  });

  it('accept button calls acceptInvitation and navigates to /matches', async () => {
    const user = userEvent.setup();
    mockGetInvitations.mockResolvedValue({
      incoming: [makeInvitation('inv-1')],
      outgoing: [],
    });
    mockAcceptInvitation.mockResolvedValue({
      matchId: 'match-42',
      invitation: makeInvitation('inv-1'),
    });
    render(<FindMatchWidget />);

    const acceptBtn = await screen.findByRole('button', {
      name: 'findMatch.invitations.accept',
    });
    await user.click(acceptBtn);
    expect(mockAcceptInvitation).toHaveBeenCalledWith('inv-1');
    expect(mockNavigate).toHaveBeenCalledWith('/matches', {
      state: { matchId: 'match-42' },
    });
  });

  it('decline button calls declineInvitation and removes the card', async () => {
    const user = userEvent.setup();
    mockGetInvitations.mockResolvedValue({
      incoming: [makeInvitation('inv-1')],
      outgoing: [],
    });
    mockDeclineInvitation.mockResolvedValue(undefined);
    render(<FindMatchWidget />);

    const declineBtn = await screen.findByRole('button', {
      name: 'findMatch.invitations.decline',
    });
    await user.click(declineBtn);
    expect(mockDeclineInvitation).toHaveBeenCalledWith('inv-1');
    await waitFor(() => {
      expect(
        screen.queryByText('findMatch.widget.incomingHeader')
      ).not.toBeInTheDocument();
    });
  });

  it('filters out expired incoming invitations', async () => {
    const expiredInv: MatchInvitation = {
      ...makeInvitation('inv-expired'),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    mockGetInvitations.mockResolvedValue({
      incoming: [expiredInv],
      outgoing: [],
    });
    render(<FindMatchWidget />);

    await waitFor(() => {
      expect(screen.getByText('findMatch.widget.empty')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('findMatch.widget.incomingHeader')
    ).not.toBeInTheDocument();
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

  it('asks the profile page to open the form in one tap', async () => {
    authState.currentWrestler = 'Needs Wrestler';
    const LocationState = () => <output aria-label="router state">{JSON.stringify(useLocation().state)}</output>;
    render(
      <MemoryRouter>
        <FindMatchWidget />
        <LocationState />
      </MemoryRouter>,
    );

    await userEvent.setup().click(screen.getByRole('link', { name: 'me.matchmaking.needsNameAction' }));

    expect(screen.getByLabelText('router state')).toHaveTextContent('{"editProfile":true}');
  });

  it('prompts a player with no wrestler name and does not poll', () => {
    authState.currentWrestler = 'Needs Wrestler';
    render(
      <MemoryRouter>
        <FindMatchWidget />
      </MemoryRouter>,
    );

    expect(screen.getByText('me.matchmaking.needsNameBody')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'me.matchmaking.needsNameAction' })).toHaveAttribute('href', '/profile');
    expect(mockGetQueue).not.toHaveBeenCalled();
  });

  it('tells the player when a challenge fails', async () => {
    mockCreateInvitation.mockRejectedValueOnce(new Error('nope'));
    mockGetQueue.mockResolvedValue([makeQueueEntry('them', 'Them', 'THE UNDERTAKER')]);
    render(<FindMatchWidget />);

    const challengeBtn = await screen.findByRole('button', { name: 'findMatch.widget.challenge' });
    await userEvent.setup().click(challengeBtn);

    expect(await screen.findByRole('alert')).toHaveTextContent('me.matchmaking.actionFailed');
  });
});
