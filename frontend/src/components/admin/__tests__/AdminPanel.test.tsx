import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockUseAuth, mockUseSiteConfig } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: mockUseSiteConfig,
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
vi.mock('../ManageTransfers', () => ({ default: () => <div data-testid="manage-transfers">ManageTransfers</div> }));
vi.mock('../ManagePlayers', () => ({ default: () => <div data-testid="manage-players">ManagePlayers</div> }));
vi.mock('../ManageDivisions', () => ({ default: () => <div data-testid="manage-divisions">ManageDivisions</div> }));
vi.mock('../ScheduleMatch', () => ({ default: () => <div data-testid="schedule-match">ScheduleMatch</div> }));
vi.mock('../ManageChampionships', () => ({ default: () => <div data-testid="manage-championships">ManageChampionships</div> }));
vi.mock('../CreateTournament', () => ({ default: () => <div data-testid="create-tournament">CreateTournament</div> }));
vi.mock('../AdminPromos', () => ({ default: () => <div data-testid="admin-promos">AdminPromos</div> }));
vi.mock('../StandaloneMatches', () => ({ default: () => <div data-testid="standalone">StandaloneMatches</div> }));
vi.mock('../ManageOveralls', () => ({ default: () => <div data-testid="overalls">ManageOveralls</div> }));
vi.mock('../ManageSeasons', () => ({ default: () => <div data-testid="manage-seasons">ManageSeasons</div> }));
vi.mock('../AdminChallenges', () => ({ default: () => <div data-testid="admin-challenges">AdminChallenges</div> }));
vi.mock('../ClearAllData', () => ({ default: () => <div data-testid="clear-all">ClearAllData</div> }));
vi.mock('../ManageUsers', () => ({ default: () => <div data-testid="manage-users">ManageUsers</div> }));
vi.mock('../ManageFeatures', () => ({ default: () => <div data-testid="manage-features">ManageFeatures</div> }));
vi.mock('../AdminContenderConfig', () => ({ default: () => <div data-testid="contender-config">ContenderConfig</div> }));

vi.mock('../AdminPanel.css', () => ({}));

import AdminPanel from '../AdminPanel';
import { ADMIN_TABS } from '../../../config/navConfig';

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
    mockUseSiteConfig.mockReturnValue({ features: { transfers: false }, isLoading: false });
  });

  it('renders the correct tab component based on URL parameter', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdminOrModerator: true,
      isSuperAdmin: false,
    });

    renderAdminPanel('/admin/divisions');
    expect(await screen.findByTestId('manage-divisions')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-players')).not.toBeInTheDocument();
  });

  it('defaults to players tab when no tab parameter', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdminOrModerator: true,
      isSuperAdmin: false,
    });

    renderAdminPanel('/admin');
    expect(await screen.findByTestId('manage-players')).toBeInTheDocument();
  });

  it('sends the old challenges tab to the call-outs view of promos', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: false });

    renderAdminPanel('/admin/challenges');
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/admin/promos?view=call-outs');
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

  it.each(['users', 'heat-config', 'danger'])('blocks Moderators from the Admin-only %s tab', (tab) => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: false });

    renderAdminPanel(`/admin/${tab}`);
    expect(screen.getByText('Full Admin Access Required')).toBeInTheDocument();
  });

  it('keeps Admin-only entries out of a Moderator desktop nav', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: false });

    renderAdminPanel('/admin/players');
    const nav = await screen.findByRole('navigation');
    const hrefs = within(nav).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/admin/overalls');
    expect(hrefs).toContain('/admin/standalone-matches');
    expect(hrefs).not.toContain('/admin/users');
    expect(hrefs).not.toContain('/admin/heat-config');
    expect(hrefs).not.toContain('/admin/danger');
  });

  it('shows every registry entry to an Admin', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: true });

    mockUseSiteConfig.mockReturnValue({ features: { transfers: true }, isLoading: false });

    renderAdminPanel('/admin/players');
    const nav = await screen.findByRole('navigation');
    expect(within(nav).getAllByRole('link')).toHaveLength(ADMIN_TABS.length);
  });

  it('leaves Transfers out of the nav while the feature is off', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: true });

    renderAdminPanel('/admin/players');
    const nav = await screen.findByRole('navigation');
    const hrefs = within(nav).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toHaveLength(ADMIN_TABS.length - 1);
    expect(hrefs).not.toContain('/admin/transfers');
  });

  it('explains a direct Transfers URL while the feature is off', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: false });

    renderAdminPanel('/admin/transfers');
    expect(screen.getByText('This feature is turned off')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-transfers')).not.toBeInTheDocument();
  });

  it('does not call a feature off before the site config has loaded', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: false });
    mockUseSiteConfig.mockReturnValue({ features: { transfers: false }, isLoading: true });

    renderAdminPanel('/admin/transfers');
    expect(screen.queryByText('This feature is turned off')).not.toBeInTheDocument();
  });

  it('opens Transfers once the feature is on', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: false });
    mockUseSiteConfig.mockReturnValue({ features: { transfers: true }, isLoading: false });

    renderAdminPanel('/admin/transfers');
    expect(await screen.findByTestId('manage-transfers')).toBeInTheDocument();
  });

  it('serves standalone matches through the guarded tab registry', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: false, isSuperAdmin: false });

    renderAdminPanel('/admin/standalone-matches');
    expect(screen.getByText('Admin Access Required')).toBeInTheDocument();
    expect(screen.queryByTestId('standalone')).not.toBeInTheDocument();
  });

  it('sends the old Match Card Builder URL to the events page', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: false });

    renderAdminPanel('/admin/events');
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/events');
  });

  it('redirects an unknown tab to the admin root', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdminOrModerator: true, isSuperAdmin: true });

    renderAdminPanel('/admin/not-a-tab');
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/admin');
  });
});
