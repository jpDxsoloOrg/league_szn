import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

const {
  mockFactionsGetAll,
  mockFactionsGetStandings,
  mockPlayersGetAll,
  mockGetMyProfile,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockFactionsGetAll: vi.fn(),
  mockFactionsGetStandings: vi.fn(),
  mockPlayersGetAll: vi.fn(),
  mockGetMyProfile: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  factionsApi: {
    getAll: mockFactionsGetAll,
    getStandings: mockFactionsGetStandings,
  },
  playersApi: {
    getAll: mockPlayersGetAll,
  },
  profileApi: {
    getMyProfile: mockGetMyProfile,
  },
}));

vi.mock('../../../contexts/AuthContext', () => ({
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

vi.mock('../FactionsList.css', () => ({}));
vi.mock('../FactionCard.css', () => ({}));

import FactionsList from '../FactionsList';

const baseFaction = (overrides: Record<string, unknown> = {}) => ({
  stableId: 'f1',
  name: 'Default Faction',
  leaderId: 'p1',
  memberIds: ['p1'],
  status: 'active',
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const basePlayer = (overrides: Record<string, unknown> = {}) => ({
  playerId: 'p1',
  name: 'Player 1',
  currentWrestler: 'Wrestler 1',
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

function renderHub() {
  return render(
    <BrowserRouter>
      <FactionsList />
    </BrowserRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ isAuthenticated: false, isWrestler: false });
  mockFactionsGetAll.mockResolvedValue([]);
  mockFactionsGetStandings.mockResolvedValue([]);
  mockPlayersGetAll.mockResolvedValue([]);
  mockGetMyProfile.mockResolvedValue(null);
});

describe('FactionsList (FAC-10)', () => {
  it('renders 6 example factions in the grid', async () => {
    const factions = Array.from({ length: 6 }, (_, i) =>
      baseFaction({
        stableId: `f${i + 1}`,
        name: `Faction ${i + 1}`,
        leaderId: `p${i + 1}`,
        memberIds: [`p${i + 1}`],
      }),
    );
    const players = Array.from({ length: 6 }, (_, i) =>
      basePlayer({ playerId: `p${i + 1}`, name: `Leader ${i + 1}` }),
    );
    mockFactionsGetAll.mockResolvedValue(factions);
    mockPlayersGetAll.mockResolvedValue(players);

    renderHub();

    for (let i = 1; i <= 6; i++) {
      expect(await screen.findByText(`Faction ${i}`)).toBeInTheDocument();
    }
  });

  it('filters the visible cards when an Active chip is clicked', async () => {
    const factions = [
      baseFaction({ stableId: 'f1', name: 'Alpha Active', status: 'active' }),
      baseFaction({ stableId: 'f2', name: 'Beta Pending', status: 'pending' }),
      baseFaction({ stableId: 'f3', name: 'Gamma Disbanded', status: 'disbanded' }),
    ];
    mockFactionsGetAll.mockResolvedValue(factions);

    renderHub();
    expect(await screen.findByText('Alpha Active')).toBeInTheDocument();
    expect(screen.getByText('Beta Pending')).toBeInTheDocument();
    expect(screen.getByText('Gamma Disbanded')).toBeInTheDocument();

    const activeChip = screen.getByRole('tab', { name: 'Active' });
    await userEvent.click(activeChip);

    await waitFor(() => {
      expect(screen.queryByText('Beta Pending')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Alpha Active')).toBeInTheDocument();
    expect(screen.queryByText('Gamma Disbanded')).not.toBeInTheDocument();
    expect(activeChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('narrows by name via the search input (case-insensitive substring)', async () => {
    mockFactionsGetAll.mockResolvedValue([
      baseFaction({ stableId: 'f1', name: 'The Bloodline' }),
      baseFaction({ stableId: 'f2', name: 'The Brood' }),
      baseFaction({ stableId: 'f3', name: 'D-Generation X' }),
    ]);

    renderHub();
    expect(await screen.findByText('The Bloodline')).toBeInTheDocument();

    const searchInput = screen.getByRole('searchbox');
    await userEvent.type(searchInput, 'BROOD');

    await waitFor(() => {
      expect(screen.queryByText('The Bloodline')).not.toBeInTheDocument();
    });
    expect(screen.getByText('The Brood')).toBeInTheDocument();
    expect(screen.queryByText('D-Generation X')).not.toBeInTheDocument();
  });

  it('renders the "Request a Faction" CTA only for wrestlers without an active faction', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isWrestler: true });
    mockGetMyProfile.mockResolvedValue(basePlayer({ stableId: undefined }));
    mockFactionsGetAll.mockResolvedValue([baseFaction()]);

    renderHub();

    expect(await screen.findByRole('link', { name: 'Request a Faction' })).toBeInTheDocument();
  });

  it('hides the "Request a Faction" CTA when the wrestler is already in a faction', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isWrestler: true });
    mockGetMyProfile.mockResolvedValue(basePlayer({ stableId: 'some-faction' }));
    mockFactionsGetAll.mockResolvedValue([baseFaction()]);

    renderHub();
    // Wait for the page to finish loading
    await screen.findByText('Default Faction');
    expect(screen.queryByRole('link', { name: 'Request a Faction' })).not.toBeInTheDocument();
  });

  it('hides the CTA for unauthenticated users', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isWrestler: false });
    mockFactionsGetAll.mockResolvedValue([baseFaction()]);

    renderHub();
    await screen.findByText('Default Faction');
    expect(screen.queryByRole('link', { name: 'Request a Faction' })).not.toBeInTheDocument();
    // Profile should never even be fetched when not auth'd
    expect(mockGetMyProfile).not.toHaveBeenCalled();
  });

  it('renders the right-rail "Recent Faction Activity" feed sorted newest-first', async () => {
    mockFactionsGetAll.mockResolvedValue([
      baseFaction({ stableId: 'f1', name: 'Old Faction', createdAt: '2026-01-01T00:00:00.000Z' }),
      baseFaction({ stableId: 'f2', name: 'New Faction', createdAt: '2026-03-01T00:00:00.000Z' }),
    ]);

    renderHub();

    const rail = await screen.findByLabelText('Recent Faction Activity');
    const summaries = within(rail).getAllByText(/was formed/);
    expect(summaries[0]).toHaveTextContent('New Faction was formed');
    expect(summaries[1]).toHaveTextContent('Old Faction was formed');
  });

  it('labels the heat gauge for accessibility', async () => {
    mockFactionsGetAll.mockResolvedValue([baseFaction()]);
    mockFactionsGetStandings.mockResolvedValue([
      {
        stableId: 'f1',
        name: 'Default Faction',
        memberCount: 1,
        wins: 0,
        losses: 0,
        draws: 0,
        winPercentage: 0,
        currentStreak: { type: 'W', count: 3 },
      },
    ]);

    renderHub();
    expect(await screen.findByLabelText('Heat: 3 of 5')).toBeInTheDocument();
  });
});
