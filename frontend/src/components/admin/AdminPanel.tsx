import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

import ManagePlayers from './ManagePlayers';
import ManageDivisions from './ManageDivisions';
import ManageMatchConfig from './ManageMatchConfig';
import ScheduleMatch from './ScheduleMatch';
import RecordResult from './RecordResult';
import ManageChampionships from './ManageChampionships';
import CreateTournament from './CreateTournament';

import AdminPromos from './AdminPromos';
import ManageSeasons from './ManageSeasons';
import CreateEvent from './CreateEvent';
import MatchCardBuilder from './MatchCardBuilder';
import ManageFantasyShows from './ManageFantasyShows';
import FantasyConfig from './FantasyConfig';
import AdminChallenges from './AdminChallenges';
import ClearAllData from './ClearAllData';
import ManageUsers from './ManageUsers';
import ManageFeatures from './ManageFeatures';
import './AdminPanel.css';

import ManageSeasonAwards from './ManageSeasonAwards';
import AdminContenderConfig from './AdminContenderConfig';
import AdminContenderOverrides from './AdminContenderOverrides';
import ManageCompanies from './ManageCompanies';
import ManageShows from './ManageShows';

type AdminTab = 'players' | 'divisions' | 'match-config' | 'schedule' | 'results' | 'championships' | 'tournaments' | 'challenges' | 'promos' | 'seasons' | 'season-awards' | 'events' | 'fantasy-shows' | 'fantasy-config' | 'contender-config' | 'contender-overrides' | 'companies' | 'shows' | 'danger' | 'users' | 'features';

const VALID_TABS: AdminTab[] = ['players', 'divisions', 'match-config', 'schedule', 'results', 'championships', 'tournaments', 'challenges', 'promos', 'seasons', 'season-awards', 'events', 'fantasy-shows', 'fantasy-config', 'contender-config', 'contender-overrides', 'companies', 'shows', 'danger', 'users', 'features'];


export default function AdminPanel() {
  const { tab } = useParams<{ tab: string }>();
  const { isAuthenticated, isAdminOrModerator, isSuperAdmin } = useAuth();

  const activeTab: AdminTab = (tab && VALID_TABS.includes(tab as AdminTab)) ? tab as AdminTab : 'players';

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdminOrModerator) {
    return (
      <div className="admin-panel">
        <div className="access-denied">
          <h2>Admin Access Required</h2>
          <p>You need admin privileges to access this panel.</p>
        </div>
      </div>
    );
  }

  // Moderators cannot access danger zone
  if (activeTab === 'danger' && !isSuperAdmin) {
    return (
      <div className="admin-panel">
        <div className="access-denied">
          <h2>Full Admin Access Required</h2>
          <p>This action requires full Admin privileges.</p>
        </div>
      </div>
    );
  }

  const tabContent: Record<AdminTab, JSX.Element> = {
    users: <ManageUsers />,
    features: <ManageFeatures />,
    players: <ManagePlayers />,
    divisions: <ManageDivisions />,
    'match-config': <ManageMatchConfig />,
    schedule: <ScheduleMatch />,
    results: <RecordResult />,
    championships: <ManageChampionships />,
    tournaments: <CreateTournament />,
    challenges: <AdminChallenges />,
    promos: <AdminPromos />,
    seasons: <ManageSeasons />,
    'season-awards': <ManageSeasonAwards />,
    events: (
      <>
        <CreateEvent />
        <MatchCardBuilder />
      </>
    ),
    'fantasy-shows': <ManageFantasyShows />,
    'fantasy-config': <FantasyConfig />,
    'contender-config': <AdminContenderConfig />,
    'contender-overrides': <AdminContenderOverrides />,
    companies: <ManageCompanies />,
    shows: <ManageShows />,
    danger: <ClearAllData />,
  };

  return (
    <div className="admin-panel">
      <div className="admin-onboarding-banner">
        <p>
          New to admin workflows? Start with{' '}
          <Link to="/guide/wiki/admin-quickstart">Admin Quickstart</Link> and then review{' '}
          <Link to="/guide/wiki/admin-workflow">Typical Weekly Workflow</Link>.
        </p>
      </div>
      <div className="admin-content">
        {tabContent[activeTab]}
      </div>
    </div>
  );
}
