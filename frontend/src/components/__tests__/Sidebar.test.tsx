import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockUseAuth, mockUseSiteConfig } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../../contexts/SiteConfigContext', () => ({
  useSiteConfig: mockUseSiteConfig,
}));

vi.mock('../../contexts/navLayoutContext', () => ({
  useNavLayout: () => ({ mode: 'sidebar', setMode: vi.fn(), toggleMode: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../LanguageSwitcher', () => ({
  default: () => <div data-testid="lang-switcher" />,
}));

vi.mock('../Sidebar.css', () => ({}));

import Sidebar from '../Sidebar';

// --- Helpers ---
const ALL_FEATURES = {
  fantasy: true,
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
};

const NO_FEATURES = {
  fantasy: false,
  challenges: false,
  promos: false,
  contenders: false,
  statistics: false,
};

function baseAuth(overrides = {}) {
  return {
    isAuthenticated: false,
    isAdminOrModerator: false,
    isSuperAdmin: false,
    isWrestler: false,
    isFantasy: false,
    signOut: vi.fn(),
    ...overrides,
  };
}

function renderSidebar(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSiteConfig.mockReturnValue({ features: ALL_FEATURES, isLoading: false });
  });

  it('renders public navigation links for unauthenticated users', () => {
    mockUseAuth.mockReturnValue(baseAuth());
    renderSidebar();

    expect(screen.getByText('nav.standings')).toBeInTheDocument();
    expect(screen.getByText('nav.championships')).toBeInTheDocument();
    expect(screen.getByText('nav.events')).toBeInTheDocument();
    expect(screen.getByText('nav.tournaments')).toBeInTheDocument();
    expect(screen.getByText('nav.help')).toBeInTheDocument();

    // Auth section shows Sign In / Sign Up for unauthenticated
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('shows admin section with sub-group headers when user is admin', () => {
    mockUseAuth.mockReturnValue(baseAuth({
      isAuthenticated: true,
      isAdminOrModerator: true,
      isSuperAdmin: false,
    }));
    renderSidebar('/admin/players');

    expect(screen.getByText('nav.admin')).toBeInTheDocument();

    // Sub-group headers are always visible when admin is expanded
    expect(screen.getByText('admin.panel.groups.matchOps')).toBeInTheDocument();
    expect(screen.getByText('admin.panel.groups.leagueSetup')).toBeInTheDocument();
    expect(screen.getByText('admin.panel.groups.contentSocial')).toBeInTheDocument();
    expect(screen.getByText('admin.panel.groups.fantasy')).toBeInTheDocument();
    expect(screen.getByText('admin.panel.groups.system')).toBeInTheDocument();

    // League Setup auto-expands because route is /admin/players
    expect(screen.getByText('admin.panel.tabs.managePlayers')).toBeInTheDocument();
    expect(screen.getByText('admin.panel.tabs.divisions')).toBeInTheDocument();

    // Items in other collapsed sub-groups should not be visible
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
    expect(screen.queryByText('admin.panel.tabs.scheduleMatch')).not.toBeInTheDocument();

    // Danger zone only for SuperAdmin (and System group is collapsed)
    expect(screen.queryByText('admin.panel.tabs.dangerZone')).not.toBeInTheDocument();
  });

  it('shows danger zone link only for SuperAdmin when System group is expanded', () => {
    mockUseAuth.mockReturnValue(baseAuth({
      isAuthenticated: true,
      isAdminOrModerator: true,
      isSuperAdmin: true,
    }));
    renderSidebar('/admin/danger');

    // System group auto-expands for /admin/danger route
    expect(screen.getByText('admin.panel.tabs.dangerZone')).toBeInTheDocument();
  });

  it('hides feature-flagged links when features are disabled', () => {
    mockUseAuth.mockReturnValue(baseAuth());
    mockUseSiteConfig.mockReturnValue({ features: NO_FEATURES, isLoading: false });
    renderSidebar();

    expect(screen.queryByText('nav.challenges')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.promos')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.contenders')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.statistics')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.fantasy')).not.toBeInTheDocument();
  });

  it('toggles admin section expand/collapse', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(baseAuth({
      isAuthenticated: true,
      isAdminOrModerator: true,
    }));
    renderSidebar('/admin');

    // Admin section starts expanded — sub-group headers visible
    expect(screen.getByText('admin.panel.groups.matchOps')).toBeInTheDocument();

    // Collapse admin section
    const toggleBtn = screen.getByText('nav.admin').closest('button')!;
    await user.click(toggleBtn);
    expect(screen.queryByText('admin.panel.groups.matchOps')).not.toBeInTheDocument();

    // Expand again
    await user.click(toggleBtn);
    expect(screen.getByText('admin.panel.groups.matchOps')).toBeInTheDocument();
  });

  it('shows logout button when authenticated and calls signOut', async () => {
    const mockSignOut = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(baseAuth({
      isAuthenticated: true,
      signOut: mockSignOut,
    }));
    renderSidebar();

    const logoutBtn = screen.getByText('common.logout');
    expect(logoutBtn).toBeInTheDocument();
    await user.click(logoutBtn);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows wrestler-specific links (profile, challenges, promos) for wrestler role', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(baseAuth({
      isAuthenticated: true,
      isWrestler: true,
    }));
    renderSidebar();

    // Wrestler group starts collapsed — expand it
    const wrestlerToggle = screen.getByText('nav.groups.wrestler').closest('button')!;
    await user.click(wrestlerToggle);

    // Wrestler gets direct profile link (not disabled)
    const profileLink = screen.getByText('nav.profile');
    expect(profileLink.tagName).not.toBe('SPAN');
    expect(profileLink.closest('a')).toHaveAttribute('href', '/profile');

    // Feature-gated links visible when features enabled
    expect(screen.getByText('nav.challenges')).toBeInTheDocument();
    expect(screen.getByText('nav.promos')).toBeInTheDocument();
  });
});
