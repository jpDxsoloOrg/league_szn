import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SiteFeatures } from '../../../services/api';

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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../LanguageSwitcher', () => ({
  default: () => <div data-testid="lang-switcher" />,
}));

vi.mock('../MoreSheet.css', () => ({}));

import MoreSheet from '../MoreSheet';

// --- Helpers ---
const ALL_FEATURES: SiteFeatures = {
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
  stables: true,
  notifications: true,
  rivalries: true,
};

function baseAuth(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    isAdminOrModerator: false,
    isWrestler: true,
    signOut: vi.fn(),
    ...overrides,
  };
}

function renderMoreSheet(props: { open?: boolean; onClose?: () => void } = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <MoreSheet open={props.open ?? true} onClose={props.onClose ?? vi.fn()} />
    </MemoryRouter>
  );
}

describe('MoreSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSiteConfig.mockReturnValue({ features: ALL_FEATURES, isLoading: false });
    mockUseAuth.mockReturnValue(baseAuth());
  });

  it('renders nothing when open is false', () => {
    renderMoreSheet({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('mobileNav.more')).not.toBeInTheDocument();
  });

  it('renders the sheet as a dialog when open', () => {
    renderMoreSheet();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'mobileNav.more' })).toBeInTheDocument();
  });

  it('pins an Admin Panel row for admins and moderators', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(baseAuth({ isAdminOrModerator: true }));
    renderMoreSheet();

    const adminRow = screen.getByText('admin.panel.title');
    expect(adminRow).toBeInTheDocument();

    await user.click(adminRow.closest('button')!);
    // Navigating closes the sheet via onClose (covered separately); row is a button, not a link
  });

  it('does not show the Admin Panel row for a plain wrestler', () => {
    mockUseAuth.mockReturnValue(baseAuth({ isAdminOrModerator: false }));
    renderMoreSheet();

    expect(screen.queryByText('admin.panel.title')).not.toBeInTheDocument();
  });

  it('excludes rows already present on the bottom tab bar', () => {
    renderMoreSheet();

    // /, /standings, /rivalries, /profile live on the tab bar
    expect(screen.queryByText('nav.dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.standings')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.rivalries')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.profile')).not.toBeInTheDocument();
  });

  it('contains the expected rows from the nav groups and standalone links', () => {
    renderMoreSheet();

    expect(screen.getByText('nav.championships')).toBeInTheDocument();
    expect(screen.getByText('nav.events')).toBeInTheDocument();
    expect(screen.getByText('nav.matchSearch')).toBeInTheDocument();
    expect(screen.getByText('nav.tournaments')).toBeInTheDocument();
    expect(screen.getByText('nav.activity')).toBeInTheDocument();
    expect(screen.getByText('nav.help')).toBeInTheDocument();
  });

  it('hides feature-flagged rows when their features are disabled', () => {
    mockUseSiteConfig.mockReturnValue({
      features: { ...ALL_FEATURES, statistics: false, contenders: false },
      isLoading: false,
    });
    renderMoreSheet();

    expect(screen.queryByText('nav.statistics')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.contenders')).not.toBeInTheDocument();
  });

  it('calls onClose when the scrim is tapped', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = renderMoreSheet({ onClose });

    const scrim = container.querySelector('.more-sheet-scrim');
    expect(scrim).not.toBeNull();
    await user.click(scrim as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderMoreSheet({ onClose });

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a logout row when authenticated and calls signOut', async () => {
    const user = userEvent.setup();
    const mockSignOut = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    mockUseAuth.mockReturnValue(baseAuth({ isAuthenticated: true, signOut: mockSignOut }));
    renderMoreSheet({ onClose });

    await user.click(screen.getByText('common.logout').closest('button')!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows a sign-in row instead of logout when signed out', () => {
    mockUseAuth.mockReturnValue(baseAuth({ isAuthenticated: false, isWrestler: false }));
    renderMoreSheet();

    expect(screen.getByText('common.signIn')).toBeInTheDocument();
    expect(screen.queryByText('common.logout')).not.toBeInTheDocument();
  });

  it('embeds the language switcher', () => {
    renderMoreSheet();

    expect(screen.getByTestId('lang-switcher')).toBeInTheDocument();
    expect(screen.getByText('languageSwitcher.label')).toBeInTheDocument();
  });
});
