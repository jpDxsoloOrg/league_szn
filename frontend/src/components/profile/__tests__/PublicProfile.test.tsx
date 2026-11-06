import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { mockGetById, mockGetStandings, authState, features } = vi.hoisted(() => ({
  mockGetById: vi.fn(),
  mockGetStandings: vi.fn(),
  authState: { isAuthenticated: false, isWrestler: false, playerId: null as string | null },
  features: { statistics: true, challenges: true },
}));

vi.mock('../../../services/api', () => ({
  playersApi: { getById: mockGetById },
  standingsApi: { get: mockGetStandings },
  divisionsApi: { getAll: vi.fn().mockResolvedValue([{ divisionId: 'd1', name: 'Raw' }]) },
  factionsApi: { getAll: vi.fn().mockResolvedValue([]) },
  tagTeamsApi: { getAll: vi.fn().mockResolvedValue([]) },
  isApiError: (err: unknown, status: number) => (err as { status?: number }).status === status,
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: () => ({ features }) }));

const stableT = (key: string) => key;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

import PublicProfile from '../PublicProfile';

const player = {
  playerId: 'p1',
  name: 'Alice',
  currentWrestler: 'Cody Rhodes',
  divisionId: 'd1',
  wins: 6,
  losses: 3,
  draws: 1,
};

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/player/p1']}>
      <Routes>
        <Route path="/player/:playerId" element={<PublicProfile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(authState, { isAuthenticated: false, isWrestler: false, playerId: null });
    mockGetById.mockResolvedValue(player);
    mockGetStandings.mockResolvedValue({
      players: [{ playerId: 'p1', recentForm: ['W', 'L'], currentStreak: { type: 'L', count: 1 } }],
    });
  });

  it('shows the record, form and division from the API', async () => {
    renderProfile();

    expect(await screen.findByRole('heading', { level: 1, name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByText('6-3-1')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('1L')).toBeInTheDocument();
    expect(screen.getByText('Raw')).toBeInTheDocument();
  });

  it('leaves out form and streak when standings have none', async () => {
    mockGetStandings.mockResolvedValue({ players: [] });
    renderProfile();

    await screen.findByText('6-3-1');
    expect(screen.queryByText('publicProfile.form')).not.toBeInTheDocument();
    expect(screen.queryByText('publicProfile.streak')).not.toBeInTheDocument();
  });

  it('keeps the head-to-head and stats links, and offers a challenge to other wrestlers', async () => {
    Object.assign(authState, { isAuthenticated: true, isWrestler: true, playerId: 'me' });
    renderProfile();

    expect(await screen.findByRole('link', { name: 'publicProfile.viewHeadToHead' })).toHaveAttribute(
      'href',
      '/stats/head-to-head?player1=me&player2=p1',
    );
    expect(screen.getByRole('link', { name: 'publicProfile.fullStats' })).toHaveAttribute('href', '/stats/player/p1');
    expect(screen.getByRole('link', { name: 'publicProfile.challenge' })).toHaveAttribute(
      'href',
      '/promos/new?promoType=call-out&targetPlayerId=p1',
    );
  });

  it('shows a not-found state for a player the API cannot return', async () => {
    mockGetById.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }));
    renderProfile();

    expect(await screen.findByText('publicProfile.notFoundTitle')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('publicProfile.notFound');
  });
});
