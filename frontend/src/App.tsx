import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './i18n';
import { AuthProvider } from './contexts/AuthContext';
import { PresenceProvider } from './contexts/PresenceContext';
import { SiteConfigProvider } from './contexts/SiteConfigContext';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import NotFound from './components/NotFound';
import ShellHeader from './components/shell/ShellHeader';
import SectionNav from './components/shell/SectionNav';
import MobileHeader from './components/mobile/MobileHeader';
import BottomTabBar from './components/mobile/BottomTabBar';
import Skeleton from './components/ui/Skeleton';
import { ToastProvider } from './components/ui/Toast';
import { useIsMobile } from './hooks/useIsMobile';
import { useRouteTitle } from './hooks/useDocumentTitle';
import { getPageInfo, getSectionTheme } from './config/navConfig';
// Route guards
import ProtectedRoute from './components/ProtectedRoute';
import FeatureRoute from './components/FeatureRoute';
import ProfileCompletionModal from './components/ProfileCompletionModal';
import AnnouncementModal from './components/AnnouncementModal';
import './App.css';

// Each route is its own chunk, so a visitor only downloads the pages they open.
const Dashboard = lazy(() => import('./components/Dashboard'));
const Standings = lazy(() => import('./components/Standings'));
const ActivityFeed = lazy(() => import('./components/ActivityFeed'));
const Championships = lazy(() => import('./components/Championships'));
const Tournaments = lazy(() => import('./components/Tournaments'));
const MatchSearch = lazy(() => import('./components/MatchSearch'));
const SeasonAwardsPage = lazy(() => import('./components/SeasonAwardsPage'));
const WikiIndex = lazy(() => import('./components/WikiIndex'));
const WikiArticle = lazy(() => import('./components/WikiArticle'));
const AdminPanel = lazy(() => import('./components/admin/AdminPanel'));
const Login = lazy(() => import('./components/auth/Login'));
const Signup = lazy(() => import('./components/auth/Signup'));
const ForgotPassword = lazy(() => import('./components/auth/ForgotPassword'));
const PostSignupWelcome = lazy(() => import('./components/auth/PostSignupWelcome'));
const ChallengeDetail = lazy(() => import('./components/challenges/ChallengeDetail'));
const MyChallenges = lazy(() => import('./components/challenges/MyChallenges'));
const PromoFeed = lazy(() => import('./components/promos/PromoFeed'));
const PromoThread = lazy(() => import('./components/promos/PromoThread'));
const PromoEditor = lazy(() => import('./components/promos/PromoEditor'));
const PlayerStats = lazy(() => import('./components/statistics/PlayerStats'));
const HeadToHeadComparison = lazy(() => import('./components/statistics/HeadToHeadComparison'));
const Leaderboards = lazy(() => import('./components/statistics/Leaderboards'));
const RecordBook = lazy(() => import('./components/statistics/RecordBook'));
const BestMatches = lazy(() => import('./components/statistics/BestMatches'));
const Rivalries = lazy(() => import('./components/statistics/Rivalries'));
const TaleOfTheTape = lazy(() => import('./components/statistics/TaleOfTheTape'));
const Achievements = lazy(() => import('./components/statistics/Achievements'));
const MatchTypeLeaderboards = lazy(() => import('./components/statistics/MatchTypeLeaderboards'));
const ContenderRankings = lazy(() => import('./components/contenders/ContenderRankings'));
const MyContenderStatus = lazy(() => import('./components/contenders/MyContenderStatus'));
const EventsCalendar = lazy(() => import('./components/events/EventsCalendar'));
const EventDetail = lazy(() => import('./components/events/EventDetail'));
const EventResults = lazy(() => import('./components/events/EventResults'));
const CommentaryView = lazy(() => import('./components/events/CommentaryView'));
const FactionsList = lazy(() => import('./components/factions/FactionsList'));
const FactionStandings = lazy(() => import('./components/factions/FactionStandings'));
const FactionDetail = lazy(() => import('./components/factions/FactionDetail'));
const FactionOverview = lazy(() => import('./components/factions/tabs/FactionOverview'));
const FactionMembers = lazy(() => import('./components/factions/tabs/FactionMembers'));
const FactionStats = lazy(() => import('./components/factions/tabs/FactionStats'));
const FactionScheduleTab = lazy(() => import('./components/factions/tabs/FactionSchedule'));
const FactionPromosTab = lazy(() => import('./components/factions/tabs/FactionPromos'));
const FactionMessages = lazy(() => import('./components/factions/tabs/FactionMessages'));
const FactionManage = lazy(() => import('./components/factions/tabs/FactionManage'));
const MyFaction = lazy(() => import('./components/factions/MyFaction'));
const TagTeamsList = lazy(() => import('./components/tagTeams/TagTeamsList'));
const TagTeamDetail = lazy(() => import('./components/tagTeams/TagTeamDetail'));
const MyTagTeam = lazy(() => import('./components/tagTeams/MyTagTeam'));
const RivalryHub = lazy(() => import('./components/rivalries/RivalryHub'));
const RivalryDetail = lazy(() => import('./components/rivalries/RivalryDetail'));
const RequestRivalry = lazy(() => import('./components/rivalries/RequestRivalry'));
const WrestlerProfile = lazy(() => import('./components/profile/WrestlerProfile'));
const PublicProfile = lazy(() => import('./components/profile/PublicProfile'));
const MyVideos = lazy(() => import('./components/profile/MyVideos'));
const FindMatchPage = lazy(() => import('./components/matchmaking/FindMatchPage'));
const Highlights = lazy(() => import('./components/Highlights'));
const MeHub = lazy(() => import('./components/shell/MeHub'));
const WikiLayout = lazy(async () => {
  const { WikiLayout: Layout } = await import('./components/Wiki');
  return { default: Layout };
});

function LegacyFactionDetailRedirect() {
  const { stableId } = useParams<{ stableId: string }>();
  return <Navigate to={stableId ? `/factions/${stableId}` : '/factions'} replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <ScrollToTop />
        <AuthProvider>
          <PresenceProvider>
            <SiteConfigProvider>
              <ToastProvider>
                <AppLayout />
              </ToastProvider>
            </SiteConfigProvider>
          </PresenceProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

const PROMOS_GUEST_PROMPT = {
  pageTitleKey: 'nav.promos',
  titleKey: 'promos.guest.title',
  descriptionKey: 'promos.guest.description',
};

function getLayoutClass(isMobile: boolean, pathname: string): string {
  const classes = ['App'];
  if (isMobile) classes.push('app-layout--mobile');
  if (pathname === '/admin' || pathname.startsWith('/admin/')) classes.push('app-layout--wide');
  return classes.join(' ');
}

function AppLayout() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const pageTitle = getPageInfo(pathname, t).title;
  useRouteTitle(pageTitle);

  return (
    <div className={getLayoutClass(isMobile, pathname)} data-section={getSectionTheme(pathname)}>
      <a href="#main" className="skip-link">{t('nav.skipToContent')}</a>
      <div className="shell-top">
        {isMobile ? <MobileHeader /> : <ShellHeader />}
        {!isMobile && <SectionNav />}
      </div>
      {/* On phones the tab rows scroll away, so only the slim header stays pinned. */}
      {isMobile && <SectionNav />}
      <p className="sr-only" role="status">{pageTitle}</p>
      <ProfileCompletionModal />
      <AnnouncementModal />
      <main id="main" tabIndex={-1}>
        {/* Inside main so a failed page or chunk leaves the navigation working. */}
        <ErrorBoundary variant="section" resetKey={pathname}>
          <Suspense fallback={<Skeleton variant="block" />}>
          <Routes>
            {/* Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/welcome" element={<PostSignupWelcome />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* Personal hub: profile links, help, language, Admin row on phones */}
            <Route path="/me" element={<MeHub />} />

            {/* Public Routes */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/standings" element={<Standings />} />
            <Route path="/activity" element={<ActivityFeed />} />
            <Route path="/championships" element={<Championships />} />
            <Route path="/matches" element={<MatchSearch />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/awards" element={<SeasonAwardsPage />} />
            <Route path="/highlights" element={<Highlights />} />
            <Route path="/guide" element={<Navigate to="/guide/wiki" replace />} />
            <Route path="/guide/wiki" element={<WikiLayout />}>
              <Route index element={<WikiIndex />} />
              <Route path=":slug" element={<WikiArticle />} />
            </Route>

            {/* Public Player Profile */}
            <Route path="/player/:playerId" element={<PublicProfile />} />

            {/* Admin Routes - Admin only (protected inside AdminPanel) */}
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/admin/:tab" element={<AdminPanel />} />

            {/* Wrestler Profile */}
            <Route path="/profile" element={
              <ProtectedRoute requiredRole="Wrestler">
                <WrestlerProfile />
              </ProtectedRoute>
            } />

            {/* Wrestler Video Submissions - gated server-side by canUploadVideos */}
            <Route path="/my-videos" element={
              <ProtectedRoute requiredRole="Wrestler">
                <MyVideos />
              </ProtectedRoute>
            } />

            {/* Find Match - Wrestler only */}
            <Route path="/find-match" element={
              <ProtectedRoute requiredRole="Wrestler">
                <FindMatchPage />
              </ProtectedRoute>
            } />

            {/* Challenge Routes - Wrestler only, feature-gated */}
            <Route path="/challenges" element={
              <FeatureRoute feature="challenges">
                <ProtectedRoute requiredRole="Wrestler">
                  <MyChallenges />
                </ProtectedRoute>
              </FeatureRoute>
            } />
            <Route path="/challenges/issue" element={
              <Navigate to="/promos/new?promoType=call-out" replace />
            } />
            <Route path="/challenges/my" element={<Navigate to="/challenges" replace />} />
            <Route path="/challenges/:challengeId" element={
              <FeatureRoute feature="challenges">
                <ProtectedRoute requiredRole="Wrestler">
                  <ChallengeDetail />
                </ProtectedRoute>
              </FeatureRoute>
            } />

            {/* Promo Routes - reading is public as the API is; cutting one is Wrestler only */}
            <Route path="/promos" element={
              <FeatureRoute feature="promos">
                <PromoFeed />
              </FeatureRoute>
            } />
            <Route path="/promos/new" element={
              <FeatureRoute feature="promos">
                <ProtectedRoute requiredRole="Wrestler" guestPrompt={PROMOS_GUEST_PROMPT}>
                  <PromoEditor />
                </ProtectedRoute>
              </FeatureRoute>
            } />
            <Route path="/promos/:promoId" element={
              <FeatureRoute feature="promos">
                <PromoThread />
              </FeatureRoute>
            } />

            {/* Rivalries — feature-gated public hub + detail; new requires auth */}
            <Route path="/rivalries" element={
              <FeatureRoute feature="rivalries"><RivalryHub /></FeatureRoute>
            } />
            <Route path="/rivalries/new" element={
              <FeatureRoute feature="rivalries">
                <ProtectedRoute requiredRole="Moderator">
                  <RequestRivalry />
                </ProtectedRoute>
              </FeatureRoute>
            } />
            <Route path="/rivalries/:rivalryId/*" element={
              <FeatureRoute feature="rivalries"><RivalryDetail /></FeatureRoute>
            } />

            {/* Statistics Routes - feature-gated */}
            <Route path="/stats" element={
              <FeatureRoute feature="statistics"><PlayerStats /></FeatureRoute>
            } />
            <Route path="/stats/player/:playerId" element={
              <FeatureRoute feature="statistics"><PlayerStats /></FeatureRoute>
            } />
            <Route path="/stats/head-to-head" element={
              <FeatureRoute feature="statistics"><HeadToHeadComparison /></FeatureRoute>
            } />
            <Route path="/stats/leaderboards" element={
              <FeatureRoute feature="statistics"><Leaderboards /></FeatureRoute>
            } />
            <Route path="/stats/records" element={
              <FeatureRoute feature="statistics"><RecordBook /></FeatureRoute>
            } />
            <Route path="/stats/rivalries" element={
              <FeatureRoute feature="statistics"><Rivalries /></FeatureRoute>
            } />
            <Route path="/stats/tale-of-tape" element={
              <FeatureRoute feature="statistics"><TaleOfTheTape /></FeatureRoute>
            } />
            <Route path="/stats/achievements" element={
              <FeatureRoute feature="statistics"><Achievements /></FeatureRoute>
            } />
            <Route path="/stats/best-matches" element={
              <FeatureRoute feature="statistics"><BestMatches /></FeatureRoute>
            } />
            <Route path="/stats/match-types" element={
              <FeatureRoute feature="statistics"><MatchTypeLeaderboards /></FeatureRoute>
            } />

            {/* Events Routes - public */}
            <Route path="/events" element={<EventsCalendar />} />
            <Route path="/events/:eventId" element={<EventDetail />} />
            <Route path="/events/:eventId/results" element={<EventResults />} />
            <Route path="/events/:eventId/commentary" element={<CommentaryView />} />

            {/* Factions Routes - feature-gated */}
            <Route path="/factions" element={
              <FeatureRoute feature="stables"><FactionsList /></FeatureRoute>
            } />
            <Route path="/factions/standings" element={
              <FeatureRoute feature="stables"><FactionStandings /></FeatureRoute>
            } />
            <Route path="/factions/:factionId" element={
              <FeatureRoute feature="stables"><FactionDetail /></FeatureRoute>
            }>
              <Route index element={<FactionOverview />} />
              <Route path="members" element={<FactionMembers />} />
              <Route path="stats" element={<FactionStats />} />
              <Route path="schedule" element={<FactionScheduleTab />} />
              <Route path="promos" element={<FactionPromosTab />} />
              <Route path="messages" element={<FactionMessages />} />
              <Route path="manage" element={<FactionManage />} />
            </Route>
            <Route path="/my-faction" element={
              <FeatureRoute feature="stables">
                <ProtectedRoute requiredRole="Wrestler">
                  <MyFaction />
                </ProtectedRoute>
              </FeatureRoute>
            } />

            {/* Legacy redirects: stables -> factions */}
            <Route path="/stables" element={<Navigate to="/factions" replace />} />
            <Route path="/stables/:stableId" element={<LegacyFactionDetailRedirect />} />
            <Route path="/my-stable" element={<Navigate to="/my-faction" replace />} />
            <Route path="/admin/stables" element={<Navigate to="/admin/factions" replace />} />

            {/* Tag Teams Routes - feature-gated */}
            <Route path="/tag-teams" element={
              <FeatureRoute feature="stables"><TagTeamsList /></FeatureRoute>
            } />
            <Route path="/tag-teams/:tagTeamId" element={
              <FeatureRoute feature="stables"><TagTeamDetail /></FeatureRoute>
            } />
            <Route path="/my-tag-team" element={
              <FeatureRoute feature="stables">
                <ProtectedRoute requiredRole="Wrestler">
                  <MyTagTeam />
                </ProtectedRoute>
              </FeatureRoute>
            } />

            {/* Contender Routes - feature-gated */}
            <Route path="/contenders" element={
              <FeatureRoute feature="contenders"><ContenderRankings /></FeatureRoute>
            } />
            <Route path="/contenders/my-status" element={
              <FeatureRoute feature="contenders"><MyContenderStatus /></FeatureRoute>
            } />

            {/* Catch-all 404 */}
            <Route path="*" element={<NotFound />} />
        </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {isMobile && <BottomTabBar />}
    </div>
  );
}

export default App;
