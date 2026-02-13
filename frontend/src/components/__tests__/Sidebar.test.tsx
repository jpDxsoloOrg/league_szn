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
    isAdmin: false,
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

  it('shows admin section with all admin links when user is admin', () => {
    mockUseAuth.mockReturnValue(baseAuth({
      isAuthenticated: true,
      isAdmin: true,
      isSuperAdmin: false,
    }));
    renderSidebar('/admin/players');

    expect(screen.getByText('nav.admin')).toBeInTheDocument();
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Feature Management')).toBeInTheDocument();
    expect(screen.getByText('admin.panel.tabs.scheduleMatch')).toBeInTheDocument();
    expect(screen.getByText('admin.panel.tabs.recordResults')).toBeInTheDocument();
    expect(screen.getByText('admin.panel.tabs.divisions')).toBeInTheDocument();

    // Danger zone only for SuperAdmin
    expect(screen.queryByText('admin.panel.tabs.dangerZone')).not.toBeInTheDocument();
  });

  it('shows danger zone link only for SuperAdmin', () => {
    mockUseAuth.mockReturnValue(baseAuth({
      isAuthenticated: true,
      isAdmin: true,
      isSuperAdmin: true,
    }));
    renderSidebar('/admin');

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
      isAdmin: true,
    }));
    renderSidebar('/admin');

    // Admin section starts expanded (adminExpanded default true)
    expect(screen.getByText('User Management')).toBeInTheDocument();

    // Collapse
    const toggleBtn = screen.getByText('nav.admin').closest('button')!;
    await user.click(toggleBtn);
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();

    // Expand again
    await user.click(toggleBtn);
    expect(screen.getByText('User Management')).toBeInTheDocument();
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

  it('shows wrestler-specific links (profile, challenges, promos) for wrestler role', () => {
    mockUseAuth.mockReturnValue(baseAuth({
      isAuthenticated: true,
      isWrestler: true,
    }));
    renderSidebar();

    // Wrestler gets direct profile link (not disabled)
    const profileLink = screen.getByText('nav.profile');
    expect(profileLink.tagName).not.toBe('SPAN');
    expect(profileLink.closest('a')).toHaveAttribute('href', '/profile');

    // Feature-gated links visible when features enabled
    expect(screen.getByText('nav.challenges')).toBeInTheDocument();
    expect(screen.getByText('nav.promos')).toBeInTheDocument();
  });
});
