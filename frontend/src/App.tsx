import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './i18n';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Standings from './components/Standings';
import Championships from './components/Championships';
import Matches from './components/Matches';
import Tournaments from './components/Tournaments';
import UserGuide from './components/UserGuide';
import AdminPanel from './components/admin/AdminPanel';
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
import FantasyLogin from './components/fantasy/FantasyLogin';
import FantasySignup from './components/fantasy/FantasySignup';
import FantasyDashboard from './components/fantasy/FantasyDashboard';
import MakePicks from './components/fantasy/MakePicks';
import FantasyLeaderboard from './components/fantasy/FantasyLeaderboard';
import WrestlerCosts from './components/fantasy/WrestlerCosts';
import ShowResults from './components/fantasy/ShowResults';
// Events components
import EventsCalendar from './components/events/EventsCalendar';
import EventDetail from './components/events/EventDetail';
import EventResults from './components/events/EventResults';
import './App.css';

function App() {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ErrorBoundary>
      <Router>
        <div className="App">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <header>
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            &#9776;
          </button>
          <h1>{t('header.title')}</h1>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Standings />} />
            <Route path="/championships" element={<Championships />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/guide" element={<UserGuide />} />
            {/* Admin Routes */}
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/admin/:tab" element={<AdminPanel />} />
            {/* Challenge Routes */}
            <Route path="/challenges" element={<ChallengeBoard />} />
            <Route path="/challenges/issue" element={<IssueChallenge />} />
            <Route path="/challenges/my" element={<MyChallenges />} />
            <Route path="/challenges/:challengeId" element={<ChallengeDetail />} />
            {/* Promo Routes */}
            <Route path="/promos" element={<PromoFeed />} />
            <Route path="/promos/new" element={<PromoEditor />} />
            <Route path="/promos/:promoId" element={<PromoThread />} />
            {/* Statistics Routes */}
            <Route path="/stats" element={<PlayerStats />} />
            <Route path="/stats/player/:playerId" element={<PlayerStats />} />
            <Route path="/stats/head-to-head" element={<HeadToHeadComparison />} />
            <Route path="/stats/leaderboards" element={<Leaderboards />} />
            <Route path="/stats/records" element={<RecordBook />} />
            <Route path="/stats/tale-of-tape" element={<TaleOfTheTape />} />
            <Route path="/stats/achievements" element={<Achievements />} />
            {/* Events Routes */}
            <Route path="/events" element={<EventsCalendar />} />
            <Route path="/events/:eventId" element={<EventDetail />} />
            <Route path="/events/:eventId/results" element={<EventResults />} />
            {/* Contender Routes */}
            <Route path="/contenders" element={<ContenderRankings />} />
            <Route path="/contenders/my-status" element={<MyContenderStatus />} />
            {/* Fantasy Routes */}
            <Route path="/fantasy" element={<FantasyLanding />} />
            <Route path="/fantasy/login" element={<FantasyLogin />} />
            <Route path="/fantasy/signup" element={<FantasySignup />} />
            <Route path="/fantasy/dashboard" element={<FantasyDashboard />} />
            <Route path="/fantasy/picks/:showId" element={<MakePicks />} />
            <Route path="/fantasy/leaderboard" element={<FantasyLeaderboard />} />
            <Route path="/fantasy/costs" element={<WrestlerCosts />} />
            <Route path="/fantasy/shows/:showId/results" element={<ShowResults />} />
          </Routes>
        </main>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
