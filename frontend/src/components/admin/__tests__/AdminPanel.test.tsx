import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

// Mock Navigate to capture redirects
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Navigate: (props: { to: string; replace?: boolean }) => (
      <div data-testid="navigate" data-to={props.to} />
    ),
  };
});

// Mock all child admin components to isolate AdminPanel logic
vi.mock('../ManagePlayers', () => ({ default: () => <div data-testid="manage-players">ManagePlayers</div> }));
vi.mock('../ManageDivisions', () => ({ default: () => <div data-testid="manage-divisions">ManageDivisions</div> }));
vi.mock('../ScheduleMatch', () => ({ default: () => <div data-testid="schedule-match">ScheduleMatch</div> }));
vi.mock('../RecordResult', () => ({ default: () => <div data-testid="record-result">RecordResult</div> }));
vi.mock('../ManageChampionships', () => ({ default: () => <div data-testid="manage-championships">ManageChampionships</div> }));
vi.mock('../CreateTournament', () => ({ default: () => <div data-testid="create-tournament">CreateTournament</div> }));
vi.mock('../AdminPromos', () => ({ default: () => <div data-testid="admin-promos">AdminPromos</div> }));
vi.mock('../ManageSeasons', () => ({ default: () => <div data-testid="manage-seasons">ManageSeasons</div> }));
vi.mock('../CreateEvent', () => ({ default: () => <div data-testid="create-event">CreateEvent</div> }));
vi.mock('../MatchCardBuilder', () => ({ default: () => <div data-testid="match-card-builder">MatchCardBuilder</div> }));
vi.mock('../ManageFantasyShows', () => ({ default: () => <div data-testid="fantasy-shows">FantasyShows</div> }));
vi.mock('../FantasyConfig', () => ({ default: () => <div data-testid="fantasy-config">FantasyConfig</div> }));
vi.mock('../AdminChallenges', () => ({ default: () => <div data-testid="admin-challenges">AdminChallenges</div> }));
vi.mock('../ClearAllData', () => ({ default: () => <div data-testid="clear-all">ClearAllData</div> }));
vi.mock('../ManageUsers', () => ({ default: () => <div data-testid="manage-users">ManageUsers</div> }));
vi.mock('../ManageFeatures', () => ({ default: () => <div data-testid="manage-features">ManageFeatures</div> }));
vi.mock('../AdminContenderConfig', () => ({ default: () => <div data-testid="contender-config">ContenderConfig</div> }));

vi.mock('../AdminPanel.css', () => ({}));

import AdminPanel from '../AdminPanel';

function renderAdminPanel(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/admin/:tab" element={<AdminPanel />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the correct tab component based on URL parameter', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdminOrModerator: true,
      isSuperAdmin: false,
    });

    renderAdminPanel('/admin/divisions');
    expect(screen.getByTestId('manage-divisions')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-players')).not.toBeInTheDocument();
  });

  it('defaults to players tab when no tab parameter', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdminOrModerator: true,
      isSuperAdmin: false,
    });

    renderAdminPanel('/admin');
    expect(screen.getByTestId('manage-players')).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdminOrModerator: false,
      isSuperAdmin: false,
    });

    renderAdminPanel('/admin/players');
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');
  });

  it('shows access denied for non-admin authenticated users', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdminOrModerator: false,
      isSuperAdmin: false,
    });

    renderAdminPanel('/admin/players');
    expect(screen.getByText('Admin Access Required')).toBeInTheDocument();
    expect(screen.getByText('You need admin privileges to access this panel.')).toBeInTheDocument();
  });

  it('blocks non-SuperAdmin from danger zone tab', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdminOrModerator: true,
      isSuperAdmin: false,
    });

    renderAdminPanel('/admin/danger');
    expect(screen.getByText('Full Admin Access Required')).toBeInTheDocument();
    expect(screen.queryByTestId('clear-all')).not.toBeInTheDocument();
  });
});
