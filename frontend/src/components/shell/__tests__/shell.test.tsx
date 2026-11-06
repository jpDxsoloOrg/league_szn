import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

const { mockUseAuth, mockUseSiteConfig } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: mockUseSiteConfig }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}));
vi.mock('../../NotificationBell', () => ({ default: () => <span data-testid="bell" /> }));
vi.mock('../../search/SearchLauncher', () => ({ default: () => <button>search</button> }));

import MeHub from '../MeHub';
import SectionNav from '../SectionNav';
import ShellHeader from '../ShellHeader';

const FEATURES = { challenges: true, promos: true, contenders: true, statistics: true, stables: true, notifications: true, rivalries: true };
const SIGNED_OUT = { isAuthenticated: false, isWrestler: false, isAdminOrModerator: false, isSuperAdmin: false };
const WRESTLER = { ...SIGNED_OUT, isAuthenticated: true, isWrestler: true };
const MODERATOR = { ...SIGNED_OUT, isAuthenticated: true, isAdminOrModerator: true };

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderAt(route: string, node: JSX.Element) {
  return render(<MemoryRouter initialEntries={[route]}>{node}<Where /></MemoryRouter>);
}

function linkNames() {
  return screen.getAllByRole('link').map((link) => link.textContent);
}

beforeEach(() => {
  mockUseSiteConfig.mockReturnValue({ features: FEATURES });
  mockUseAuth.mockReturnValue({ ...WRESTLER, signOut: vi.fn() });
});

describe('ShellHeader', () => {
  it('shows the five sections, bell, search, and no Admin for a wrestler', () => {
    renderAt('/standings', <ShellHeader />);
    const nav = screen.getByRole('navigation', { name: 'mobileNav.ariaLabel' });
    expect(nav).toHaveTextContent('nav.sections.home');
    expect(nav).toHaveTextContent('nav.sections.me');
    expect(nav).not.toHaveTextContent('nav.admin');
    expect(screen.getByRole('link', { name: 'nav.sections.rankings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('bell')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'search' })).toBeInTheDocument();
  });

  it('adds Admin as a sixth item for staff', () => {
    mockUseAuth.mockReturnValue(MODERATOR);
    renderAt('/admin/players', <ShellHeader />);
    const admin = screen.getByRole('link', { name: 'nav.admin' });
    expect(admin).toHaveAttribute('href', '/admin');
    expect(admin).toHaveAttribute('aria-current', 'page');
  });

  it('offers sign-in instead of Me when signed out', () => {
    mockUseAuth.mockReturnValue(SIGNED_OUT);
    renderAt('/', <ShellHeader />);
    expect(screen.getByRole('link', { name: 'common.signIn' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: 'nav.sections.me' })).not.toBeInTheDocument();
  });

  it('does not light Sign In for a guest reading help, and marks the help icon instead', () => {
    mockUseAuth.mockReturnValue(SIGNED_OUT);
    renderAt('/guide/wiki', <ShellHeader />);
    expect(screen.getByRole('link', { name: 'common.signIn' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'nav.help' })).toHaveAttribute('aria-current', 'page');
  });

  it('lights Sign In on the sign-in page', () => {
    mockUseAuth.mockReturnValue(SIGNED_OUT);
    renderAt('/login', <ShellHeader />);
    expect(screen.getByRole('link', { name: 'common.signIn' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('SectionNav', () => {
  it('renders the section tabs with a drill-down still marked active', () => {
    renderAt('/events/e1/results', <SectionNav />);
    expect(screen.getByRole('link', { name: 'nav.tabs.calendar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'nav.tabs.matches' })).toHaveAttribute('href', '/matches');
  });

  it('hides a tab when its flag is off', () => {
    mockUseSiteConfig.mockReturnValue({ features: { ...FEATURES, contenders: false } });
    renderAt('/standings', <SectionNav />);
    expect(screen.queryByRole('link', { name: 'nav.contenders' })).not.toBeInTheDocument();
  });

  it('adds the third-level bar on stats pages only', () => {
    renderAt('/stats/records', <SectionNav />);
    expect(screen.getByRole('navigation', { name: 'nav.statistics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'statistics.nav.records' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'nav.tabs.feudHistory' })).toHaveAttribute('href', '/stats/rivalries');
  });

  it.each(['/me', '/login', '/admin/players', '/nowhere'])('renders nothing on %s', (route) => {
    renderAt(route, <SectionNav />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('MeHub', () => {
  it('lists personal pages for a wrestler, with no Admin row', () => {
    renderAt('/me', <MeHub />);
    expect(linkNames()).toEqual(expect.arrayContaining(['nav.profile', 'nav.findMatch', 'nav.tabs.callOuts', 'nav.myVideos', 'nav.help', 'nav.leagueRules']));
    expect(linkNames()).not.toContain('nav.admin');
  });

  it('puts the Admin row first for staff', () => {
    mockUseAuth.mockReturnValue({ ...MODERATOR, signOut: vi.fn() });
    renderAt('/me', <MeHub />);
    expect(linkNames()[0]).toBe('nav.admin');
  });

  it('tells a hidden player why and how to fix it', () => {
    mockUseAuth.mockReturnValue({ ...WRESTLER, playerId: 'p1', currentWrestler: 'Needs Wrestler', signOut: vi.fn() });
    renderAt('/me', <MeHub />);
    expect(screen.getByRole('heading', { name: 'me.setup.hiddenTitle' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'me.setup.enterName' })).toHaveAttribute('href', '/profile');
  });

  it('opens the wrestler form in one tap from the hidden notice', async () => {
    mockUseAuth.mockReturnValue({ ...WRESTLER, playerId: 'p1', currentWrestler: 'Needs Wrestler', signOut: vi.fn() });
    const RouterState = () => <span data-testid="router-state">{JSON.stringify(useLocation().state)}</span>;
    render(<MemoryRouter initialEntries={['/me']}><MeHub /><RouterState /></MemoryRouter>);

    await userEvent.click(screen.getByRole('link', { name: 'me.setup.enterName' }));

    expect(screen.getByTestId('router-state')).toHaveTextContent('{"editProfile":true}');
  });

  it('shows no hidden notice to a player with a wrestler, or to staff with no player', () => {
    mockUseAuth.mockReturnValue({ ...WRESTLER, playerId: 'p1', currentWrestler: 'Edge', signOut: vi.fn() });
    const view = renderAt('/me', <MeHub />);
    expect(screen.queryByRole('heading', { name: 'me.setup.hiddenTitle' })).not.toBeInTheDocument();
    view.unmount();

    mockUseAuth.mockReturnValue({ ...MODERATOR, playerId: null, currentWrestler: null, signOut: vi.fn() });
    renderAt('/me', <MeHub />);
    expect(screen.queryByRole('heading', { name: 'me.setup.hiddenTitle' })).not.toBeInTheDocument();
  });

  it('offers sign in, sign up and help when signed out', () => {
    mockUseAuth.mockReturnValue({ ...SIGNED_OUT, signOut: vi.fn() });
    renderAt('/me', <MeHub />);
    expect(linkNames()).toEqual(['common.signIn', 'common.signUp', 'nav.help', 'nav.leagueRules']);
    expect(screen.queryByRole('button', { name: 'common.logout' })).not.toBeInTheDocument();
  });

  it('signs out and returns home', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ ...WRESTLER, signOut });
    renderAt('/me', <MeHub />);

    await userEvent.click(screen.getByRole('button', { name: 'common.logout' }));

    expect(signOut).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/'));
  });
});
