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
          </Routes>
        </main>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
