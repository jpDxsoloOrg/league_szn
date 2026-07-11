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

vi.mock('../BottomTabBar.css', () => ({}));

import BottomTabBar from '../BottomTabBar';

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
    isAuthenticated: false,
    isAdminOrModerator: false,
    isWrestler: false,
    signOut: vi.fn(),
    ...overrides,
  };
}

function renderTabBar(
  route = '/',
  props: { onMoreClick?: () => void; isMoreOpen?: boolean } = {}
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BottomTabBar
        onMoreClick={props.onMoreClick ?? vi.fn()}
        isMoreOpen={props.isMoreOpen ?? false}
      />
    </MemoryRouter>
  );
}

describe('BottomTabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSiteConfig.mockReturnValue({ features: ALL_FEATURES, isLoading: false });
    mockUseAuth.mockReturnValue(baseAuth({ isAuthenticated: true }));
  });

  it('renders five items with the expected labels', () => {
    renderTabBar();

    expect(screen.getByText('mobileNav.home')).toBeInTheDocument();
    expect(screen.getByText('nav.standings')).toBeInTheDocument();
    expect(screen.getByText('nav.rivalries')).toBeInTheDocument();
    expect(screen.getByText('mobileNav.profile')).toBeInTheDocument();
    expect(screen.getByText('mobileNav.more')).toBeInTheDocument();

    // Exactly 4 links + 1 More button
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('marks the tab matching the current route as active', () => {
    renderTabBar('/standings');

    const standingsLink = screen.getByText('nav.standings').closest('a')!;
    expect(standingsLink).toHaveAttribute('aria-current', 'page');
    expect(standingsLink).toHaveClass('bottom-tab-bar__item--active');

    // The other tabs are not active
    const homeLink = screen.getByText('mobileNav.home').closest('a')!;
    expect(homeLink).not.toHaveAttribute('aria-current');
    expect(homeLink).not.toHaveClass('bottom-tab-bar__item--active');
  });

  it('marks Home active only on an exact "/" match', () => {
    renderTabBar('/');

    const homeLink = screen.getByText('mobileNav.home').closest('a')!;
    expect(homeLink).toHaveAttribute('aria-current', 'page');
  });

  it('replaces the Rivalries tab with Championships when the rivalries feature is off', () => {
    mockUseSiteConfig.mockReturnValue({
      features: { ...ALL_FEATURES, rivalries: false },
      isLoading: false,
    });
    renderTabBar();

    expect(screen.queryByText('nav.rivalries')).not.toBeInTheDocument();
    const championshipsLink = screen.getByText('nav.championships').closest('a')!;
    expect(championshipsLink).toHaveAttribute('href', '/championships');
  });

  it('points the Profile tab at /login when signed out', () => {
    mockUseAuth.mockReturnValue(baseAuth({ isAuthenticated: false }));
    renderTabBar();

    const profileLink = screen.getByText('mobileNav.profile').closest('a')!;
    expect(profileLink).toHaveAttribute('href', '/login');
  });

  it('points the Profile tab at /profile when signed in', () => {
    mockUseAuth.mockReturnValue(baseAuth({ isAuthenticated: true }));
    renderTabBar();

    const profileLink = screen.getByText('mobileNav.profile').closest('a')!;
    expect(profileLink).toHaveAttribute('href', '/profile');
  });

  it('calls onMoreClick when the More button is tapped', async () => {
    const user = userEvent.setup();
    const onMoreClick = vi.fn();
    renderTabBar('/', { onMoreClick });

    await user.click(screen.getByText('mobileNav.more').closest('button')!);
    expect(onMoreClick).toHaveBeenCalledTimes(1);
  });

  it('renders the More button active and suppresses tab highlight while the sheet is open', () => {
    renderTabBar('/standings', { isMoreOpen: true });

    const moreButton = screen.getByText('mobileNav.more').closest('button')!;
    expect(moreButton).toHaveClass('bottom-tab-bar__item--active');
    expect(moreButton).toHaveAttribute('aria-expanded', 'true');

    // Route-matched tab is de-highlighted while the More sheet is open
    const standingsLink = screen.getByText('nav.standings').closest('a')!;
    expect(standingsLink).not.toHaveClass('bottom-tab-bar__item--active');
  });
});
