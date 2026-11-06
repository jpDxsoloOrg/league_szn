import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// --- Hoisted mocks for contexts and child components ---
const { mockUseAuth, mockUseSiteConfig } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: mockUseAuth,
}));

vi.mock('../../contexts/SiteConfigContext', () => ({
  SiteConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSiteConfig: mockUseSiteConfig,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../i18n', () => ({}));

// Mock heavy child components to keep tests lightweight
vi.mock('../shell/ShellHeader', () => ({ default: () => <nav data-testid="shell-header">ShellHeader</nav> }));
vi.mock('../shell/SectionNav', () => ({ default: () => <div data-testid="section-nav">SectionNav</div> }));
vi.mock('../Dashboard', () => ({ default: () => <div data-testid="dashboard">Dashboard</div> }));
vi.mock('../Standings', () => ({ default: () => <div data-testid="standings">Standings</div> }));
vi.mock('../Championships', () => ({ default: () => <div data-testid="championships">Championships</div> }));
vi.mock('../MatchSearch', () => ({ default: () => <div data-testid="match-search">MatchSearch</div> }));
vi.mock('../Tournaments', () => ({ default: () => <div data-testid="tournaments">Tournaments</div> }));
vi.mock('../admin/AdminPanel', () => ({ default: () => <div data-testid="admin-panel">AdminPanel</div> }));
vi.mock('../auth/Login', () => ({ default: () => <div data-testid="login">Login</div> }));
vi.mock('../auth/Signup', () => ({ default: () => <div data-testid="signup">Signup</div> }));
vi.mock('../challenges/ChallengeDetail', () => ({ default: () => <div>ChallengeDetail</div> }));
vi.mock('../challenges/MyChallenges', () => ({ default: () => <div>MyChallenges</div> }));
vi.mock('../promos/PromoFeed', () => ({ default: () => <div>PromoFeed</div> }));
vi.mock('../promos/PromoThread', () => ({ default: () => <div>PromoThread</div> }));
vi.mock('../promos/PromoEditor', () => ({ default: () => <div>PromoEditor</div> }));
vi.mock('../statistics/PlayerStats', () => ({ default: () => <div data-testid="player-stats">PlayerStats</div> }));
vi.mock('../statistics/HeadToHeadComparison', () => ({ default: () => <div>H2H</div> }));
vi.mock('../statistics/Leaderboards', () => ({ default: () => <div>Leaderboards</div> }));
vi.mock('../statistics/RecordBook', () => ({ default: () => <div>RecordBook</div> }));
vi.mock('../statistics/TaleOfTheTape', () => ({ default: () => <div>TaleOfTape</div> }));
vi.mock('../statistics/Achievements', () => ({ default: () => <div>Achievements</div> }));
vi.mock('../contenders/ContenderRankings', () => ({ default: () => <div>ContenderRankings</div> }));
vi.mock('../contenders/MyContenderStatus', () => ({ default: () => <div>MyContenderStatus</div> }));
vi.mock('../events/EventsCalendar', () => ({ default: () => <div data-testid="events">Events</div> }));
vi.mock('../events/EventDetail', () => ({ default: () => <div>EventDetail</div> }));
vi.mock('../events/EventResults', () => ({ default: () => <div>EventResults</div> }));
vi.mock('../profile/WrestlerProfile', () => ({ default: () => <div data-testid="profile">Profile</div> }));
vi.mock('../ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../ProfileCompletionModal', () => ({ default: () => null }));
vi.mock('../AnnouncementModal', () => ({ default: () => null }));

// Keep the wiki's markdown stack out of App tests
vi.mock('../Wiki', () => ({ WikiLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../WikiIndex', () => ({ default: () => <div data-testid="wiki-index">WikiIndex</div> }));
vi.mock('../WikiArticle', () => ({ default: () => <div data-testid="wiki-article">WikiArticle</div> }));

vi.mock('../../App.css', () => ({}));

// We need to override the router in App.tsx to use MemoryRouter.
// Since App uses BrowserRouter internally, we mock react-router-dom
// to swap BrowserRouter with a MemoryRouter we can control.
let testEntries = ['/'];
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => (
      <actual.MemoryRouter initialEntries={testEntries}>{children}</actual.MemoryRouter>
    ),
    Navigate: (props: { to: string; replace?: boolean }) => (
      <div data-testid="navigate" data-to={props.to} />
    ),
  };
});

import App from '../../App';

const ALL_FEATURES = {
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
};

function authenticatedAuth(overrides = {}) {
  return {
    isAuthenticated: true,
    isLoading: false,
    isAdminOrModerator: true,
    isSuperAdmin: false,
    isModerator: false,
    isWrestler: true,
    groups: ['Admin', 'Wrestler'],
    email: 'test@example.com',
    playerId: 'p1',
    signIn: vi.fn(),
    signUp: vi.fn(),
    confirmSignUp: vi.fn(),
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
    hasRole: () => true,
    ...overrides,
  };
}

function unauthenticatedAuth() {
  return authenticatedAuth({
    isAuthenticated: false,
    isAdminOrModerator: false,
    isSuperAdmin: false,
    isWrestler: false,
    groups: [],
    email: null,
    playerId: null,
    hasRole: () => false,
  });
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testEntries = ['/'];
    mockUseSiteConfig.mockReturnValue({ features: ALL_FEATURES, isLoading: false });
  });

  it('renders the shell and lazy-loads the page into main', async () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());
    render(<App />);

    expect(screen.getByTestId('shell-header')).toBeInTheDocument();
    expect(screen.getByTestId('section-nav')).toBeInTheDocument();
    expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByTestId('dashboard'));
  });

  it('renders public routes without authentication', async () => {
    mockUseAuth.mockReturnValue(unauthenticatedAuth());
    testEntries = ['/championships'];
    render(<App />);

    expect(await screen.findByTestId('championships')).toBeInTheDocument();
  });

  it('redirects protected routes to login when not authenticated', async () => {
    mockUseAuth.mockReturnValue(unauthenticatedAuth());
    testEntries = ['/profile'];
    render(<App />);

    expect(await screen.findByTestId('navigate')).toHaveAttribute('data-to', '/login');
  });

  it('renders /matches as MatchSearch page', async () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());
    testEntries = ['/matches'];
    render(<App />);

    expect(await screen.findByTestId('match-search')).toBeInTheDocument();
  });

  it('renders /tournaments as Tournaments page', async () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());
    testEntries = ['/tournaments'];
    render(<App />);

    expect(await screen.findByTestId('tournaments')).toBeInTheDocument();
  });

  it('renders /admin/tournaments as Admin panel route', async () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());
    testEntries = ['/admin/tournaments'];
    render(<App />);

    expect(await screen.findByTestId('admin-panel')).toBeInTheDocument();
  });

  it('themes the page by section and names it in the tab title', async () => {
    mockUseAuth.mockReturnValue(unauthenticatedAuth());
    testEntries = ['/matches'];
    const { container } = render(<App />);
    await screen.findByTestId('match-search');
    expect(container.querySelector('.App')).toHaveAttribute('data-section', 'events');
    expect(document.title).toBe('nav.tabs.matches | League SZN');
  });

  it.each([
    ['/promos', 'PromoFeed'],
    ['/promos/p1', 'PromoThread'],
  ])('lets guests read %s, which the API serves publicly', async (path, page) => {
    mockUseAuth.mockReturnValue(unauthenticatedAuth());
    testEntries = [path];
    const { container } = render(<App />);
    expect(await screen.findByText(page)).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    expect(container.querySelector('.App')).toHaveAttribute('data-section', 'storylines');
  });

  it('shows guests on /promos/new a sign-in prompt and keeps the section', async () => {
    mockUseAuth.mockReturnValue(unauthenticatedAuth());
    testEntries = ['/promos/new'];
    const { container } = render(<App />);
    expect(await screen.findByRole('heading', { name: 'promos.guest.title' })).toBeInTheDocument();
    expect(screen.queryByText('PromoEditor')).not.toBeInTheDocument();
    expect(container.querySelector('.App')).toHaveAttribute('data-section', 'storylines');
  });

  it('redirects /guide to /guide/wiki', async () => {
    mockUseAuth.mockReturnValue(unauthenticatedAuth());
    testEntries = ['/guide'];
    render(<App />);

    expect(await screen.findByTestId('navigate')).toHaveAttribute('data-to', '/guide/wiki');
  });

  it('redirects feature-gated routes to home when feature is disabled', async () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());
    mockUseSiteConfig.mockReturnValue({
      features: { ...ALL_FEATURES, statistics: false },
      isLoading: false,
    });
    testEntries = ['/stats'];
    render(<App />);

    expect(await screen.findByTestId('navigate')).toHaveAttribute('data-to', '/');
  });
});
