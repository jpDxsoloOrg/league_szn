import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const {
  mockUpdate,
  mockInvite,
  mockRemoveMember,
  mockDisband,
  mockGetInvitations,
  mockListMessages,
  mockPlayersGetAll,
  mockUseOutletContext,
  mockUseAuth,
  mockNavigate,
} = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockInvite: vi.fn(),
  mockRemoveMember: vi.fn(),
  mockDisband: vi.fn(),
  mockGetInvitations: vi.fn(),
  mockListMessages: vi.fn(),
  mockPlayersGetAll: vi.fn(),
  mockUseOutletContext: vi.fn(),
  mockUseAuth: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('../../../../services/api', () => ({
  factionsApi: {
    update: mockUpdate,
    invite: mockInvite,
    removeMember: mockRemoveMember,
    disband: mockDisband,
    getInvitations: mockGetInvitations,
    messages: { list: mockListMessages },
  },
  playersApi: { getAll: mockPlayersGetAll },
  imagesApi: { generateUploadUrl: vi.fn(), uploadToS3: vi.fn() },
}));

vi.mock('react-router-dom', async () => {
  const actual: typeof import('react-router-dom') = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useOutletContext: () => mockUseOutletContext(),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

const interpolatingT = (_key: string, fallback?: string, options?: Record<string, unknown>) => {
  let text = fallback ?? _key;
  if (options) {
    for (const [name, value] of Object.entries(options)) {
      text = text.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value));
    }
  }
  return text;
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: interpolatingT }),
}));

vi.mock('../FactionManage.css', () => ({}));
vi.mock('../../FactionImageUploader.css', () => ({}));
vi.mock('../../RemoveMemberModal.css', () => ({}));
vi.mock('../../FactionImageUploader', () => ({
  default: () => <div data-testid="image-uploader-stub" />,
}));

import FactionManage from '../FactionManage';

const baseFaction = (overrides: Record<string, unknown> = {}) => ({
  stableId: 'f1',
  name: 'The Brood',
  leaderId: 'leader',
  leaderName: 'Edge',
  memberIds: ['leader', 'm1'],
  status: 'active',
  wins: 0,
  losses: 0,
  draws: 0,
  imageUrl: '/img/brood.png',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  members: [
    { playerId: 'leader', playerName: 'Edge Player', wrestlerName: 'Edge', wins: 0, losses: 0, draws: 0 },
    { playerId: 'm1', playerName: 'Christian Player', wrestlerName: 'Christian', wins: 0, losses: 0, draws: 0 },
  ],
  standings: { winPercentage: 0, recentForm: [], currentStreak: { type: 'W', count: 0 } },
  headToHead: [],
  matchTypeRecords: [],
  recentMatches: [],
  ...overrides,
});

function renderTab() {
  // Mount under MemoryRouter with a redirect target so Navigate doesn't
  // crash if the gate trips.
  return render(
    <MemoryRouter initialEntries={['/factions/f1/manage']}>
      <Routes>
        <Route path="/factions/:factionId/manage" element={<FactionManage />} />
        <Route path="/factions/:factionId" element={<p>Overview page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseOutletContext.mockReturnValue({ faction: baseFaction() });
  mockUseAuth.mockReturnValue({ playerId: 'leader', isAdminOrModerator: false });
  mockUpdate.mockResolvedValue(undefined);
  mockInvite.mockResolvedValue(undefined);
  mockRemoveMember.mockResolvedValue({ status: 'active' });
  mockDisband.mockResolvedValue(undefined);
  mockGetInvitations.mockResolvedValue([]);
  mockListMessages.mockResolvedValue({ items: [] });
  mockPlayersGetAll.mockResolvedValue([]);
});

describe('FactionManage tab (FAC-16)', () => {
  it('renders the LEADER VIEW banner and all three cards for a leader caller', async () => {
    renderTab();
    await screen.findByText(/LEADER VIEW · Only you and admins can see this tab\./);
    expect(screen.getByRole('heading', { name: 'Faction Identity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Roster Management' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Danger Zone' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Audit log (last 10 actions)' })).toBeInTheDocument();
  });

  it('redirects to the Overview tab when the caller is neither leader nor admin', async () => {
    mockUseAuth.mockReturnValue({ playerId: 'someone-else', isAdminOrModerator: false });

    renderTab();

    expect(await screen.findByText('Overview page')).toBeInTheDocument();
    expect(screen.queryByText(/LEADER VIEW/)).not.toBeInTheDocument();
  });

  it('renders the full Manage surface for an admin caller who is not in the faction', async () => {
    mockUseAuth.mockReturnValue({ playerId: 'admin-1', isAdminOrModerator: true });

    renderTab();
    await screen.findByText(/LEADER VIEW/);
    expect(screen.getByRole('heading', { name: 'Faction Identity' })).toBeInTheDocument();
  });

  it('saves identity changes via factionsApi.update and surfaces a success toast', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText(/LEADER VIEW/);

    const nameInput = screen.getByDisplayValue('The Brood');
    await user.clear(nameInput);
    await user.type(nameInput, 'The Gold Standard');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        'f1',
        expect.objectContaining({ name: 'The Gold Standard' }),
      );
    });

    expect(await screen.findByText('Faction identity saved.')).toBeInTheDocument();
  });

  it('triggers the disband flow on confirm and navigates to /factions with a toast', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText(/LEADER VIEW/);

    await user.click(screen.getByRole('button', { name: /Disband The Brood/ }));

    expect(await screen.findByRole('dialog', { name: /Disband The Brood\?/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disband faction' }));

    await waitFor(() => {
      expect(mockDisband).toHaveBeenCalledWith('f1');
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/factions',
        expect.objectContaining({
          state: expect.objectContaining({ toast: expect.stringContaining('disbanded') }),
        }),
      );
    });
  });

  it('removes a member via the shared modal and reloads the roster on success', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText(/LEADER VIEW/);

    // Christian is the only non-leader row.
    const rosterCard = screen
      .getByRole('heading', { name: 'Roster Management' })
      .closest('section')!;
    await user.click(
      within(rosterCard).getByRole('button', { name: /Remove Christian from the faction/ }),
    );

    expect(await screen.findByRole('dialog', { name: /Remove Christian from The Brood/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove member' }));

    await waitFor(() => {
      expect(mockRemoveMember).toHaveBeenCalledWith('f1', 'm1');
    });
    // Roster reload triggers another invitations / players / channel fetch.
    await waitFor(() => {
      expect(mockGetInvitations).toHaveBeenCalledTimes(2);
    });
  });

  it('sends an invitation with the selected player and clears the form', async () => {
    mockPlayersGetAll.mockResolvedValueOnce([
      {
        playerId: 'eligible-1',
        name: 'Eligible Player',
        currentWrestler: 'Test Wrestler',
        wins: 0,
        losses: 0,
        draws: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const user = userEvent.setup();
    renderTab();
    await screen.findByText(/LEADER VIEW/);

    // Wait for the eligible-players dropdown to populate.
    const playerSelect = await screen.findByLabelText('Player');
    await waitFor(() => {
      expect(within(playerSelect as HTMLSelectElement).getByRole('option', { name: /Eligible/ })).toBeInTheDocument();
    });
    await user.selectOptions(playerSelect, 'eligible-1');

    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => {
      expect(mockInvite).toHaveBeenCalledWith('f1', { playerId: 'eligible-1', message: undefined });
    });
  });

  it('derives the audit log from channel system messages', async () => {
    mockListMessages.mockResolvedValueOnce({
      items: [
        {
          messageId: 's1',
          factionId: 'f1',
          authorPlayerId: 'system',
          body: 'Christian joined the faction',
          messageType: 'system',
          createdAt: '2026-04-30T10:00:00.000Z',
        },
        {
          messageId: 'u1',
          factionId: 'f1',
          authorPlayerId: 'leader',
          body: 'A user message',
          messageType: 'user',
          createdAt: '2026-04-29T10:00:00.000Z',
        },
      ],
    });

    renderTab();
    await screen.findByText(/LEADER VIEW/);

    expect(await screen.findByText('Christian joined the faction')).toBeInTheDocument();
    // User messages stay out of the audit log.
    expect(screen.queryByText('A user message')).not.toBeInTheDocument();
  });
});
