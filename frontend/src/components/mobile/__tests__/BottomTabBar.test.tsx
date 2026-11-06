import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SiteFeatures } from '../../../services/api';

const { mockUseAuth, mockUseSiteConfig } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: mockUseSiteConfig }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import BottomTabBar from '../BottomTabBar';

const ALL_FEATURES: SiteFeatures = {
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
  stables: true,
  notifications: true,
  rivalries: true,
};

function renderTabBar(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BottomTabBar />
    </MemoryRouter>,
  );
}

describe('BottomTabBar', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isWrestler: true, isAdminOrModerator: false, isSuperAdmin: false });
    mockUseSiteConfig.mockReturnValue({ features: ALL_FEATURES });
  });

  it('renders the five sections', () => {
    renderTabBar();
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'nav.sections.home',
      'nav.sections.events',
      'nav.sections.rankings',
      'nav.sections.storylines',
      'nav.sections.me',
    ]);
  });

  it.each([
    ['/', 'nav.sections.home'],
    ['/activity', 'nav.sections.home'],
    ['/events/abc/results', 'nav.sections.events'],
    ['/matches', 'nav.sections.events'],
    ['/stats/records', 'nav.sections.rankings'],
    ['/player/p1', 'nav.sections.rankings'],
    ['/promos/p1', 'nav.sections.storylines'],
    ['/my-faction', 'nav.sections.me'],
    ['/contenders/my-status', 'nav.sections.me'],
    ['/admin/players', 'nav.sections.me'],
  ])('highlights the section for %s', (route, label) => {
    renderTabBar(route);
    const current = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  it('turns Me into a sign-in entry when signed out', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isWrestler: false, isAdminOrModerator: false, isSuperAdmin: false });
    renderTabBar();
    expect(screen.getByRole('link', { name: 'common.signIn' })).toHaveAttribute('href', '/me');
    expect(screen.queryByRole('link', { name: 'nav.sections.me' })).not.toBeInTheDocument();
  });

  it('does not light Sign In for a guest reading help', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isWrestler: false, isAdminOrModerator: false, isSuperAdmin: false });
    renderTabBar('/guide/wiki/league-rules');
    const current = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toEqual([]);
  });

  it('lands Storylines on the first enabled tab', () => {
    mockUseSiteConfig.mockReturnValue({ features: { ...ALL_FEATURES, rivalries: false } });
    renderTabBar();
    expect(screen.getByRole('link', { name: 'nav.sections.storylines' })).toHaveAttribute('href', '/promos');
  });

  it('hides Storylines when all of its features are off', () => {
    mockUseSiteConfig.mockReturnValue({ features: { ...ALL_FEATURES, rivalries: false, promos: false, stables: false } });
    renderTabBar();
    expect(screen.queryByRole('link', { name: 'nav.sections.storylines' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });
});
