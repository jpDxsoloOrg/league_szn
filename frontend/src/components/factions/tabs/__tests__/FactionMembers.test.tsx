import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const {
  mockGetStats,
  mockRemoveMember,
  mockNavigate,
  mockUseOutletContext,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockGetStats: vi.fn(),
  mockRemoveMember: vi.fn(),
  mockNavigate: vi.fn(),
  mockUseOutletContext: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../../services/api', () => ({
  factionsApi: {
    getStats: mockGetStats,
    removeMember: mockRemoveMember,
  },
  playersApi: {
    getAll: vi.fn().mockResolvedValue([]),
  },
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

vi.mock('../FactionMembers.css', () => ({}));
vi.mock('../../InviteToFactionModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div role="dialog" aria-label="Invite mock">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

import FactionMembers from '../FactionMembers';

const baseMember = (overrides: Record<string, unknown> = {}) => ({
  playerId: 'p1',
  playerName: 'Player 1',
  wrestlerName: 'Wrestler 1',
  imageUrl: '/img/p1.png',
  wins: 0,
  losses: 0,
  draws: 0,
  ...overrides,
});

const baseFaction = (overrides: Record<string, unknown> = {}) => ({
  stableId: 'f1',
  name: 'The Brood',
  leaderId: 'leader',
  leaderName: 'Edge',
  memberIds: ['leader', 'm1', 'm2', 'm3', 'm4'],
  status: 'active',
  wins: 30,
  losses: 10,
  draws: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  imageUrl: '/img/faction.png',
  members: [
    baseMember({ playerId: 'leader', playerName: 'Edge Player', wrestlerName: 'Edge', wins: 10, losses: 0 }),
    baseMember({ playerId: 'm1', playerName: 'Christian P', wrestlerName: 'Christian', wins: 8, losses: 2 }),
    baseMember({ playerId: 'm2', playerName: 'Gangrel P', wrestlerName: 'Gangrel', wins: 6, losses: 4 }),
    baseMember({ playerId: 'm3', playerName: 'Matt P', wrestlerName: 'Matt Hardy', wins: 4, losses: 2 }),
    baseMember({ playerId: 'm4', playerName: 'Jeff P', wrestlerName: 'Jeff Hardy', wins: 2, losses: 2 }),
  ],
  standings: {
    winPercentage: 75,
    recentForm: ['W', 'W', 'L', 'W', 'W'],
    currentStreak: { type: 'W', count: 3 },
  },
  headToHead: [],
  matchTypeRecords: [],
  recentMatches: [],
  ...overrides,
});

const baseStatsResponse = (faction: ReturnType<typeof baseFaction>) => ({
  factionId: faction.stableId,
  factionName: faction.name,
  seasonId: null,
  totals: {
    wins: 30,
    losses: 10,
    draws: 0,
    winPercentage: 75,
    matchCount: 40,
    recentForm: ['W', 'W', 'L', 'W', 'W'],
    currentStreak: { type: 'W', count: 3 },
  },
  members: [
    {
      playerId: 'leader',
      playerName: 'Edge Player',
      wrestlerName: 'Edge',
      wins: 10,
      losses: 0,
      draws: 0,
      winPercentage: 100,
      recentForm: ['W', 'W', 'W', 'W', 'W'],
      currentStreak: { type: 'W', count: 5 },
    },
    {
      playerId: 'm1',
      playerName: 'Christian P',
      wrestlerName: 'Christian',
      wins: 8,
      losses: 2,
      draws: 0,
      winPercentage: 80,
      recentForm: ['W', 'L', 'W', 'W', 'W'],
      currentStreak: { type: 'W', count: 3 },
    },
    {
      playerId: 'm2',
      playerName: 'Gangrel P',
      wrestlerName: 'Gangrel',
      wins: 6,
      losses: 4,
      draws: 0,
      winPercentage: 60,
      recentForm: ['L', 'L', 'L', 'W', 'W'],
      currentStreak: { type: 'L', count: 3 },
    },
    {
      playerId: 'm3',
      playerName: 'Matt P',
      wrestlerName: 'Matt Hardy',
      wins: 4,
      losses: 2,
      draws: 0,
      winPercentage: 66.7,
      recentForm: ['W', 'L', 'W', 'L', 'W'],
      currentStreak: { type: 'W', count: 1 },
    },
    {
      playerId: 'm4',
      playerName: 'Jeff P',
      wrestlerName: 'Jeff Hardy',
      wins: 2,
      losses: 2,
      draws: 0,
      winPercentage: 50,
      recentForm: [],
      currentStreak: undefined,
    },
  ],
  matchTypeBreakdown: [],
  headToHead: [],
});

function renderTab() {
  return render(
    <MemoryRouter>
      <FactionMembers />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  const faction = baseFaction();
  mockUseOutletContext.mockReturnValue({ faction });
  mockGetStats.mockResolvedValue(baseStatsResponse(faction));
  mockUseAuth.mockReturnValue({ playerId: 'leader', isWrestler: true });
});

describe('FactionMembers tab (FAC-12)', () => {
  it('renders 5 members sorted by wins descending by default', async () => {
    renderTab();
    await waitFor(() => expect(mockGetStats).toHaveBeenCalled());

    const rows = await screen.findAllByRole('article');
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText('Edge')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Christian')).toBeInTheDocument();
    expect(within(rows[4]).getByText('Jeff Hardy')).toBeInTheDocument();
  });

  it('reorders rows when switching sort to By Win%', async () => {
    renderTab();
    await screen.findAllByRole('article');

    await userEvent.selectOptions(screen.getByLabelText('Sort members'), 'winPct');

    const rows = screen.getAllByRole('article');
    expect(within(rows[0]).getByText('Edge')).toBeInTheDocument(); // 100%
    expect(within(rows[1]).getByText('Christian')).toBeInTheDocument(); // 80%
    expect(within(rows[2]).getByText('Matt Hardy')).toBeInTheDocument(); // 66.7%
  });

  it('filters by name via the search input (case-insensitive)', async () => {
    renderTab();
    await screen.findAllByRole('article');

    await userEvent.type(screen.getByPlaceholderText('Search…'), 'GANGREL');

    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(1);
    });
    const remaining = screen.getAllByRole('article');
    expect(within(remaining[0]).getByText('Gangrel')).toBeInTheDocument();
  });

  it('hides the Invite CTA and Remove action for non-leader callers', async () => {
    mockUseAuth.mockReturnValue({ playerId: 'm1', isWrestler: true });
    renderTab();
    await screen.findAllByRole('article');

    expect(screen.queryByRole('button', { name: 'Invite member' })).not.toBeInTheDocument();

    const christianRow = screen
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Christian'))!;
    await userEvent.click(within(christianRow).getByRole('button', { name: /Actions for/ }));
    expect(screen.queryByRole('menuitem', { name: 'Remove from faction' })).not.toBeInTheDocument();
  });

  it('shows the Remove action only on non-leader rows for leader callers', async () => {
    renderTab(); // leader is the default
    await screen.findAllByRole('article');

    const rows = screen.getAllByRole('article');
    const leaderRow = rows.find((a) => within(a).queryByText('Edge'))!;
    const memberRow = rows.find((a) => within(a).queryByText('Christian'))!;

    // Leader's own row: no Remove
    await userEvent.click(within(leaderRow).getByRole('button', { name: /Actions for/ }));
    expect(screen.queryByRole('menuitem', { name: 'Remove from faction' })).not.toBeInTheDocument();

    // Non-leader row: Remove available
    await userEvent.click(within(memberRow).getByRole('button', { name: /Actions for/ }));
    expect(screen.getByRole('menuitem', { name: 'Remove from faction' })).toBeInTheDocument();
  });

  it('calls removeMember and reloads on confirm', async () => {
    mockRemoveMember.mockResolvedValueOnce({ status: 'active' });
    renderTab();
    await screen.findAllByRole('article');

    const memberRow = screen
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Christian'))!;
    await userEvent.click(within(memberRow).getByRole('button', { name: /Actions for/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from faction' }));

    expect(await screen.findByRole('dialog', { name: /Remove Christian from The Brood/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove member' }));

    await waitFor(() => {
      expect(mockRemoveMember).toHaveBeenCalledWith('f1', 'm1');
    });
    // Stats get refetched after a successful remove.
    await waitFor(() => {
      expect(mockGetStats).toHaveBeenCalledTimes(2);
    });
  });

  it('surfaces the disband warning in the confirmation modal when membership would drop to one', async () => {
    const twoMemberFaction = baseFaction({
      memberIds: ['leader', 'm1'],
      members: [
        baseMember({ playerId: 'leader', wrestlerName: 'Edge', wins: 1 }),
        baseMember({ playerId: 'm1', wrestlerName: 'Christian', wins: 1 }),
      ],
    });
    mockUseOutletContext.mockReturnValue({ faction: twoMemberFaction });
    mockGetStats.mockResolvedValue(baseStatsResponse(twoMemberFaction));

    renderTab();
    await screen.findAllByRole('article');

    const memberRow = screen
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Christian'))!;
    await userEvent.click(within(memberRow).getByRole('button', { name: /Actions for/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from faction' }));

    expect(
      await screen.findByText(
        /This will disband the faction — only the leader would remain\./,
      ),
    ).toBeInTheDocument();
  });

  it('navigates to /factions with a toast when removal disbands the faction', async () => {
    mockRemoveMember.mockResolvedValueOnce({ status: 'disbanded' });
    renderTab();
    await screen.findAllByRole('article');

    const memberRow = screen
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Christian'))!;
    await userEvent.click(within(memberRow).getByRole('button', { name: /Actions for/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from faction' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove member' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/factions',
        expect.objectContaining({ state: expect.any(Object) }),
      );
    });
  });
});

// ─── FAC-23 — Leave faction option ─────────────────────────────────
describe('FactionMembers tab — Leave faction (FAC-23)', () => {
  it("shows Leave faction on the caller's own row when they're a non-leader member", async () => {
    // Caller is "m1" (Christian) — a regular member, not the leader.
    mockUseAuth.mockReturnValue({ playerId: 'm1', isWrestler: true });
    renderTab();
    await screen.findAllByRole('article');

    const myRow = screen
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Christian'))!;
    await userEvent.click(within(myRow).getByRole('button', { name: /Actions for/ }));

    expect(screen.getByRole('menuitem', { name: 'Leave faction' })).toBeInTheDocument();
    // Non-leader callers must not see Remove anywhere — Leave is the only
    // destructive action available to them.
    expect(screen.queryByRole('menuitem', { name: 'Remove from faction' })).not.toBeInTheDocument();
  });

  it("does NOT show Leave faction on the leader's own row", async () => {
    // Default beforeEach makes the caller the leader.
    renderTab();
    await screen.findAllByRole('article');

    const leaderRow = screen
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Edge'))!;
    await userEvent.click(within(leaderRow).getByRole('button', { name: /Actions for/ }));

    expect(screen.queryByRole('menuitem', { name: 'Leave faction' })).not.toBeInTheDocument();
  });

  it("does NOT show Leave faction on another member's row (only on caller's own)", async () => {
    // Caller is m1 (Christian) — opening m2's (Gangrel) action menu.
    mockUseAuth.mockReturnValue({ playerId: 'm1', isWrestler: true });
    renderTab();
    await screen.findAllByRole('article');

    const otherRow = screen
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Gangrel'))!;
    await userEvent.click(within(otherRow).getByRole('button', { name: /Actions for/ }));

    expect(screen.queryByRole('menuitem', { name: 'Leave faction' })).not.toBeInTheDocument();
  });

  it('calls removeMember with the caller playerId and navigates to /factions on confirm', async () => {
    mockUseAuth.mockReturnValue({ playerId: 'm1', isWrestler: true });
    mockRemoveMember.mockResolvedValueOnce({ status: 'active' });
    renderTab();
    await screen.findAllByRole('article');

    const myRow = screen
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Christian'))!;
    await userEvent.click(within(myRow).getByRole('button', { name: /Actions for/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Leave faction' }));

    // Modal renders the leave-mode copy (title references the faction, not
    // a third-party member name).
    expect(await screen.findByRole('dialog', { name: /Leave The Brood/ })).toBeInTheDocument();
    // The confirm button label is the leave variant, not "Remove member".
    await userEvent.click(screen.getByRole('button', { name: 'Leave faction' }));

    await waitFor(() => {
      expect(mockRemoveMember).toHaveBeenCalledWith('f1', 'm1');
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/factions',
        expect.objectContaining({ state: expect.any(Object) }),
      );
    });
  });
});
