import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const {
  mockGetMyProfile,
  mockFactionsGetById,
  mockFactionsGetAll,
  mockFactionsGetInvitations,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockGetMyProfile: vi.fn(),
  mockFactionsGetById: vi.fn(),
  mockFactionsGetAll: vi.fn(),
  mockFactionsGetInvitations: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  profileApi: { getMyProfile: mockGetMyProfile },
  factionsApi: {
    getById: mockFactionsGetById,
    getAll: mockFactionsGetAll,
    getInvitations: mockFactionsGetInvitations,
    update: vi.fn(),
    disband: vi.fn(),
    leave: vi.fn(),
    removeMember: vi.fn(),
    respondToInvitation: vi.fn(),
  },
  imagesApi: { generateUploadUrl: vi.fn(), uploadToS3: vi.fn() },
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

vi.mock('../MyFaction.css', () => ({}));
vi.mock('../FactionImageUploader.css', () => ({}));
vi.mock('../CreateFactionModal', () => ({ default: () => null }));
vi.mock('../InviteToFactionModal', () => ({ default: () => null }));

import MyFaction from '../MyFaction';

function renderRoute(initialEntries: string[] = ['/my-faction']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/my-faction" element={<MyFaction />} />
        <Route
          path="/factions/:factionId"
          element={<p data-testid="redirect-target">Detail page</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ isAuthenticated: true });
  mockFactionsGetAll.mockResolvedValue([]);
  mockFactionsGetInvitations.mockResolvedValue([]);
});

describe('MyFaction redirect (FAC-10 follow-up)', () => {
  it('redirects to /factions/:stableId when the caller already has a faction', async () => {
    mockGetMyProfile.mockResolvedValueOnce({
      playerId: 'p1',
      name: 'Player',
      currentWrestler: 'Wrestler',
      wins: 0,
      losses: 0,
      draws: 0,
      stableId: 'fac-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockFactionsGetById.mockResolvedValueOnce({
      stableId: 'fac-1',
      name: 'The Brood',
      leaderId: 'p1',
      memberIds: ['p1'],
      status: 'active',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      members: [],
      standings: { winPercentage: 0, recentForm: [], currentStreak: { type: 'W', count: 0 } },
      headToHead: [],
      matchTypeRecords: [],
      recentMatches: [],
    });

    renderRoute();

    expect(await screen.findByTestId('redirect-target')).toBeInTheDocument();
  });

  it('renders the create-faction surface for callers with no faction yet', async () => {
    mockGetMyProfile.mockResolvedValueOnce({
      playerId: 'p1',
      name: 'Player',
      currentWrestler: 'Wrestler',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderRoute();

    // The "no faction yet" surface stays here so the create / accept flow
    // still has a home; verify we don't redirect away in that case.
    await waitFor(() => {
      expect(screen.queryByTestId('redirect-target')).not.toBeInTheDocument();
    });
  });

  it('keeps the route mounted for unauthenticated callers (login prompt)', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });

    renderRoute();

    expect(
      await screen.findByText('Please log in to manage your faction.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('redirect-target')).not.toBeInTheDocument();
  });
});
