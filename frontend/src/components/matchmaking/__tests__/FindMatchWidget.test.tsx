import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  InvitationListResponse,
  MatchInvitation,
} from '../../../types/matchmaking';

// --- Hoisted mocks ---
const {
  mockNavigate,
  mockEnablePresence,
  mockDisablePresence,
  authState,
  presenceState,
  mockGetInvitations,
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
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count != null ? `${key}:${options.count}` : key,
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
    joinQueue: vi.fn(),
    leaveQueue: vi.fn(),
    getQueue: vi.fn(),
    getOnline: vi.fn(),
    createInvitation: vi.fn(),
    getInvitations: mockGetInvitations,
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
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

const emptyInvitations: InvitationListResponse = { incoming: [], outgoing: [] };

describe('FindMatchWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isWrestler = true;
    authState.playerId = 'me';
    presenceState.presenceEnabled = false;
    mockGetInvitations.mockResolvedValue(emptyInvitations);
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

  it('renders Offline label + toggle that calls enablePresence when off', async () => {
    const user = userEvent.setup();
    mockEnablePresence.mockResolvedValue(undefined);
    render(<FindMatchWidget />);

    // Status label span shows `findMatch.appearOnline.off`
    expect(
      screen.getAllByText('findMatch.appearOnline.off').length
    ).toBeGreaterThan(0);

    // Toggle button (when off) has label `findMatch.appearOnline.on`
    const toggle = screen.getByRole('button', {
      name: 'findMatch.appearOnline.on',
    });
    await user.click(toggle);
    expect(mockEnablePresence).toHaveBeenCalledTimes(1);
  });

  it('renders Online label + toggle that calls disablePresence when on', async () => {
    const user = userEvent.setup();
    presenceState.presenceEnabled = true;
    mockDisablePresence.mockResolvedValue(undefined);
    render(<FindMatchWidget />);

    expect(
      screen.getAllByText('findMatch.appearOnline.on').length
    ).toBeGreaterThan(0);

    const toggle = screen.getByRole('button', {
      name: 'findMatch.appearOnline.off',
    });
    await user.click(toggle);
    expect(mockDisablePresence).toHaveBeenCalledTimes(1);
  });

  it('shows pending invitation count badge after getInvitations resolves', async () => {
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

  it('CTA button navigates to /find-match when clicked', async () => {
    const user = userEvent.setup();
    render(<FindMatchWidget />);

    const cta = screen.getByRole('button', { name: 'findMatch.widget.open' });
    await user.click(cta);
    expect(mockNavigate).toHaveBeenCalledWith('/find-match');
  });
});
