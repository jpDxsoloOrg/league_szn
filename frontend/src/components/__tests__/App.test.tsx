import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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
vi.mock('../Sidebar', () => ({ default: () => <nav data-testid="sidebar">Sidebar</nav> }));
vi.mock('../TopBar', () => ({ default: () => <div data-testid="topbar">TopBar</div> }));
vi.mock('../Standings', () => ({ default: () => <div data-testid="standings">Standings</div> }));
vi.mock('../Championships', () => ({ default: () => <div data-testid="championships">Championships</div> }));
vi.mock('../Tournaments', () => ({ default: () => <div data-testid="tournaments">Tournaments</div> }));
vi.mock('../UserGuide', () => ({ default: () => <div data-testid="guide">Guide</div> }));
vi.mock('../admin/AdminPanel', () => ({ default: () => <div data-testid="admin-panel">AdminPanel</div> }));
vi.mock('../auth/Login', () => ({ default: () => <div data-testid="login">Login</div> }));
vi.mock('../auth/Signup', () => ({ default: () => <div data-testid="signup">Signup</div> }));
vi.mock('../challenges/ChallengeBoard', () => ({ default: () => <div data-testid="challenge-board">ChallengeBoard</div> }));
vi.mock('../challenges/ChallengeDetail', () => ({ default: () => <div>ChallengeDetail</div> }));
vi.mock('../challenges/IssueChallenge', () => ({ default: () => <div>IssueChallenge</div> }));
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
vi.mock('../fantasy/FantasyLanding', () => ({ default: () => <div data-testid="fantasy-landing">FantasyLanding</div> }));
vi.mock('../fantasy/FantasyDashboard', () => ({ default: () => <div>FantasyDashboard</div> }));
vi.mock('../fantasy/MakePicks', () => ({ default: () => <div>MakePicks</div> }));
vi.mock('../fantasy/FantasyLeaderboard', () => ({ default: () => <div>FantasyLeaderboard</div> }));
vi.mock('../fantasy/WrestlerCosts', () => ({ default: () => <div>WrestlerCosts</div> }));
vi.mock('../fantasy/ShowResults', () => ({ default: () => <div>ShowResults</div> }));
vi.mock('../events/EventsCalendar', () => ({ default: () => <div data-testid="events">Events</div> }));
vi.mock('../events/EventDetail', () => ({ default: () => <div>EventDetail</div> }));
vi.mock('../events/EventResults', () => ({ default: () => <div>EventResults</div> }));
vi.mock('../profile/WrestlerProfile', () => ({ default: () => <div data-testid="profile">Profile</div> }));
vi.mock('../ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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
  fantasy: true,
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
};

function authenticatedAuth(overrides = {}) {
  return {
    isAuthenticated: true,
    isLoading: false,
    isAdmin: true,
    isSuperAdmin: false,
    isModerator: false,
    isWrestler: true,
    isFantasy: true,
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
    isAdmin: false,
    isSuperAdmin: false,
    isWrestler: false,
    isFantasy: false,
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

  it('renders with sidebar, topbar, and main content area', () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());
    render(<App />);

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('topbar')).toBeInTheDocument();
    expect(screen.getByTestId('standings')).toBeInTheDocument();
  });

  it('renders public routes without authentication', () => {
    mockUseAuth.mockReturnValue(unauthenticatedAuth());
    testEntries = ['/championships'];
    render(<App />);

    expect(screen.getByTestId('championships')).toBeInTheDocument();
  });

  it('redirects protected routes to login when not authenticated', async () => {
    mockUseAuth.mockReturnValue(unauthenticatedAuth());
    testEntries = ['/profile'];
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');
    });
  });

  it('redirects /matches to /events', async () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());
    testEntries = ['/matches'];
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/events');
    });
  });

  it('redirects feature-gated routes to home when feature is disabled', async () => {
    mockUseAuth.mockReturnValue(authenticatedAuth());
    mockUseSiteConfig.mockReturnValue({
      features: { ...ALL_FEATURES, statistics: false },
      isLoading: false,
    });
    testEntries = ['/stats'];
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/');
    });
  });
});
