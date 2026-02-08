import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './i18n';
import { AuthProvider } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Standings from './components/Standings';
import Championships from './components/Championships';
import Matches from './components/Matches';
import Tournaments from './components/Tournaments';
import UserGuide from './components/UserGuide';
import AdminPanel from './components/admin/AdminPanel';
// Auth components
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
// Challenge components
import ChallengeBoard from './components/challenges/ChallengeBoard';
import ChallengeDetail from './components/challenges/ChallengeDetail';
import IssueChallenge from './components/challenges/IssueChallenge';
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
import TaleOfTheTape from './components/statistics/TaleOfTheTape';
import Achievements from './components/statistics/Achievements';
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
// Profile components
import WrestlerProfile from './components/profile/WrestlerProfile';
// Route guard
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
        <div className="App">
        <Sidebar />
        <TopBar />
        <main>
          <Routes>
            {/* Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* Public Routes */}
            <Route path="/" element={<Standings />} />
            <Route path="/championships" element={<Championships />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/guide" element={<UserGuide />} />

            {/* Admin Routes - Admin only (protected inside AdminPanel) */}
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/admin/:tab" element={<AdminPanel />} />

            {/* Wrestler Profile */}
            <Route path="/profile" element={
              <ProtectedRoute requiredRole="Wrestler">
                <WrestlerProfile />
              </ProtectedRoute>
            } />

            {/* Challenge Routes - Wrestler only */}
            <Route path="/challenges" element={
              <ProtectedRoute requiredRole="Wrestler">
                <ChallengeBoard />
              </ProtectedRoute>
            } />
            <Route path="/challenges/issue" element={
              <ProtectedRoute requiredRole="Wrestler">
                <IssueChallenge />
              </ProtectedRoute>
            } />
            <Route path="/challenges/my" element={
              <ProtectedRoute requiredRole="Wrestler">
                <MyChallenges />
              </ProtectedRoute>
            } />
            <Route path="/challenges/:challengeId" element={
              <ProtectedRoute requiredRole="Wrestler">
                <ChallengeDetail />
              </ProtectedRoute>
            } />

            {/* Promo Routes - Wrestler only */}
            <Route path="/promos" element={
              <ProtectedRoute requiredRole="Wrestler">
                <PromoFeed />
              </ProtectedRoute>
            } />
            <Route path="/promos/new" element={
              <ProtectedRoute requiredRole="Wrestler">
                <PromoEditor />
              </ProtectedRoute>
            } />
            <Route path="/promos/:promoId" element={
              <ProtectedRoute requiredRole="Wrestler">
                <PromoThread />
              </ProtectedRoute>
            } />

            {/* Statistics Routes - public */}
            <Route path="/stats" element={<PlayerStats />} />
            <Route path="/stats/player/:playerId" element={<PlayerStats />} />
            <Route path="/stats/head-to-head" element={<HeadToHeadComparison />} />
            <Route path="/stats/leaderboards" element={<Leaderboards />} />
            <Route path="/stats/records" element={<RecordBook />} />
            <Route path="/stats/tale-of-tape" element={<TaleOfTheTape />} />
            <Route path="/stats/achievements" element={<Achievements />} />

            {/* Events Routes - public */}
            <Route path="/events" element={<EventsCalendar />} />
            <Route path="/events/:eventId" element={<EventDetail />} />
            <Route path="/events/:eventId/results" element={<EventResults />} />

            {/* Contender Routes - public */}
            <Route path="/contenders" element={<ContenderRankings />} />
            <Route path="/contenders/my-status" element={<MyContenderStatus />} />

            {/* Fantasy Routes - Fantasy role required for interactive features */}
            <Route path="/fantasy" element={<FantasyLanding />} />
            <Route path="/fantasy/dashboard" element={
              <ProtectedRoute requiredRole="Fantasy">
                <FantasyDashboard />
              </ProtectedRoute>
            } />
            <Route path="/fantasy/picks/:eventId" element={
              <ProtectedRoute requiredRole="Fantasy">
                <MakePicks />
              </ProtectedRoute>
            } />
            <Route path="/fantasy/leaderboard" element={
              <ProtectedRoute requiredRole="Fantasy">
                <FantasyLeaderboard />
              </ProtectedRoute>
            } />
            <Route path="/fantasy/costs" element={
              <ProtectedRoute requiredRole="Fantasy">
                <WrestlerCosts />
              </ProtectedRoute>
            } />
            <Route path="/fantasy/events/:eventId/results" element={
              <ProtectedRoute requiredRole="Fantasy">
                <ShowResults />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
        </div>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
