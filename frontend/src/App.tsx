import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './i18n';
import { AuthProvider } from './contexts/AuthContext';
import { SiteConfigProvider } from './contexts/SiteConfigContext';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import NotFound from './components/NotFound';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './components/Dashboard';
import Standings from './components/Standings';
import ActivityFeed from './components/ActivityFeed';
import Championships from './components/Championships';
import Tournaments from './components/Tournaments';
import MatchSearch from './components/MatchSearch';
import SeasonAwardsPage from './components/SeasonAwardsPage';
import { WikiLayout } from './components/Wiki';
import WikiIndex from './components/WikiIndex';
import WikiArticle from './components/WikiArticle';
import AdminPanel from './components/admin/AdminPanel';
import StandaloneMatches from './components/admin/StandaloneMatches';
// Auth components
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import ForgotPassword from './components/auth/ForgotPassword';
// Challenge components
import ChallengeDetail from './components/challenges/ChallengeDetail';
// IssueChallenge kept as a component but route redirects to PromoEditor in call-out mode
import MyChallenges from './components/challenges/MyChallenges';
// Promo components
import PromoFeed from './components/promos/PromoFeed';
import PromoThread from './components/promos/PromoThread';
import PromoEditor from './components/promos/PromoEditor';
// Statistics components
import PlayerStats from './components/statistics/PlayerStats';
import HeadToHeadComparison from './components/statistics/HeadToHeadComparison';
import Leaderboards from './components/statistics/Leaderboards';
import RecordBook from './components/statistics/RecordBook';
import BestMatches from './components/statistics/BestMatches';
import Rivalries from './components/statistics/Rivalries';
import TaleOfTheTape from './components/statistics/TaleOfTheTape';
import Achievements from './components/statistics/Achievements';
import MatchTypeLeaderboards from './components/statistics/MatchTypeLeaderboards';
// Contender components
import ContenderRankings from './components/contenders/ContenderRankings';
import MyContenderStatus from './components/contenders/MyContenderStatus';
// Fantasy components
import FantasyLanding from './components/fantasy/FantasyLanding';
import FantasyDashboard from './components/fantasy/FantasyDashboard';
import MakePicks from './components/fantasy/MakePicks';
import FantasyLeaderboard from './components/fantasy/FantasyLeaderboard';
import WrestlerCosts from './components/fantasy/WrestlerCosts';
import ShowResults from './components/fantasy/ShowResults';
// Events components
import EventsCalendar from './components/events/EventsCalendar';
import EventDetail from './components/events/EventDetail';
import EventResults from './components/events/EventResults';
// Stables components
import StablesList from './components/stables/StablesList';
import StableDetail from './components/stables/StableDetail';
import MyStable from './components/stables/MyStable';
// Tag Teams components
import TagTeamsList from './components/tagTeams/TagTeamsList';
import TagTeamDetail from './components/tagTeams/TagTeamDetail';
import MyTagTeam from './components/tagTeams/MyTagTeam';
// Profile components
import WrestlerProfile from './components/profile/WrestlerProfile';
import PublicProfile from './components/profile/PublicProfile';
// Route guard
import ProtectedRoute from './components/ProtectedRoute';
import FeatureRoute from './components/FeatureRoute';
import ProfileCompletionModal from './components/ProfileCompletionModal';
import Highlights from './components/Highlights';
import AnnouncementModal from './components/AnnouncementModal';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <ScrollToTop />
        <AuthProvider>
          <SiteConfigProvider>
            <AppLayout />
          </SiteConfigProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

function AppLayout() {
  return (
    <div className="App layout-sidebar">
      <Sidebar />
      <TopBar />
      <ProfileCompletionModal />
      <AnnouncementModal />
      <main>
          <Routes>
            {/* Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

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
            <Route path="/admin/standalone-matches" element={<StandaloneMatches />} />

            {/* Wrestler Profile */}
            <Route path="/profile" element={
              <ProtectedRoute requiredRole="Wrestler">
                <WrestlerProfile />
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

            {/* Promo Routes - Wrestler only, feature-gated */}
            <Route path="/promos" element={
              <FeatureRoute feature="promos">
                <ProtectedRoute requiredRole="Wrestler">
                  <PromoFeed />
                </ProtectedRoute>
              </FeatureRoute>
            } />
            <Route path="/promos/new" element={
              <FeatureRoute feature="promos">
                <ProtectedRoute requiredRole="Wrestler">
                  <PromoEditor />
                </ProtectedRoute>
              </FeatureRoute>
            } />
            <Route path="/promos/:promoId" element={
              <FeatureRoute feature="promos">
                <ProtectedRoute requiredRole="Wrestler">
                  <PromoThread />
                </ProtectedRoute>
              </FeatureRoute>
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

            {/* Stables Routes - feature-gated */}
            <Route path="/stables" element={
              <FeatureRoute feature="stables"><StablesList /></FeatureRoute>
            } />
            <Route path="/stables/:stableId" element={
              <FeatureRoute feature="stables"><StableDetail /></FeatureRoute>
            } />
            <Route path="/my-stable" element={
              <FeatureRoute feature="stables">
                <ProtectedRoute requiredRole="Wrestler">
                  <MyStable />
                </ProtectedRoute>
              </FeatureRoute>
            } />

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

            {/* Fantasy Routes - feature-gated, Fantasy role required for interactive features */}
            <Route path="/fantasy" element={
              <FeatureRoute feature="fantasy"><FantasyLanding /></FeatureRoute>
            } />
            <Route path="/fantasy/dashboard" element={
              <FeatureRoute feature="fantasy">
                <ProtectedRoute requiredRole="Fantasy">
                  <FantasyDashboard />
                </ProtectedRoute>
              </FeatureRoute>
            } />
            <Route path="/fantasy/picks/:eventId" element={
              <FeatureRoute feature="fantasy">
                <ProtectedRoute requiredRole="Fantasy">
                  <MakePicks />
                </ProtectedRoute>
              </FeatureRoute>
            } />
            <Route path="/fantasy/leaderboard" element={
              <FeatureRoute feature="fantasy">
                <ProtectedRoute requiredRole="Fantasy">
                  <FantasyLeaderboard />
                </ProtectedRoute>
              </FeatureRoute>
            } />
            <Route path="/fantasy/costs" element={
              <FeatureRoute feature="fantasy">
                <ProtectedRoute requiredRole="Fantasy">
                  <WrestlerCosts />
                </ProtectedRoute>
              </FeatureRoute>
            } />
            <Route path="/fantasy/events/:eventId/results" element={
              <FeatureRoute feature="fantasy">
                <ProtectedRoute requiredRole="Fantasy">
                  <ShowResults />
                </ProtectedRoute>
              </FeatureRoute>
            } />

            {/* Catch-all 404 */}
            <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
