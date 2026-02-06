import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './i18n';
import ErrorBoundary from './components/ErrorBoundary';
import Standings from './components/Standings';
import Championships from './components/Championships';
import Matches from './components/Matches';
import Tournaments from './components/Tournaments';
import UserGuide from './components/UserGuide';
import AdminPanel from './components/admin/AdminPanel';
import LanguageSwitcher from './components/LanguageSwitcher';
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

  return (
    <ErrorBoundary>
      <Router>
        <div className="App">
        <header>
          <h1>{t('header.title')}</h1>
          <nav>
            <Link to="/">{t('nav.standings')}</Link>
            <Link to="/championships">{t('nav.championships')}</Link>
            <Link to="/matches">{t('nav.matches')}</Link>
            <Link to="/tournaments">{t('nav.tournaments')}</Link>
            <Link to="/events">{t('nav.events')}</Link>
            <Link to="/fantasy">{t('nav.fantasy')}</Link>
            <Link to="/guide">{t('nav.help')}</Link>
            <Link to="/admin">{t('nav.admin')}</Link>
            <LanguageSwitcher />
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Standings />} />
            <Route path="/championships" element={<Championships />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/guide" element={<UserGuide />} />
            <Route path="/admin" element={<AdminPanel />} />
            {/* Events Routes */}
            <Route path="/events" element={<EventsCalendar />} />
            <Route path="/events/:eventId" element={<EventDetail />} />
            <Route path="/events/:eventId/results" element={<EventResults />} />
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
