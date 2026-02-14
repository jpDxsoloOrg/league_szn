import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

import ManagePlayers from './ManagePlayers';
import ManageDivisions from './ManageDivisions';
import ManageMatchTypes from './ManageMatchTypes';
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
import AdminGuide from './AdminGuide';
import ClearAllData from './ClearAllData';
import ManageUsers from './ManageUsers';
import ManageFeatures from './ManageFeatures';
import './AdminPanel.css';

import AdminContenderConfig from './AdminContenderConfig';

type AdminTab = 'players' | 'divisions' | 'match-types' | 'schedule' | 'results' | 'championships' | 'tournaments' | 'challenges' | 'promos' | 'seasons' | 'events' | 'fantasy-shows' | 'fantasy-config' | 'contender-config' | 'guide' | 'danger' | 'users' | 'features';

const VALID_TABS: AdminTab[] = ['players', 'divisions', 'match-types', 'schedule', 'results', 'championships', 'tournaments', 'challenges', 'promos', 'seasons', 'events', 'fantasy-shows', 'fantasy-config', 'contender-config', 'guide', 'danger', 'users', 'features'];


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

  return (
    <div className="admin-panel">
      <div className="admin-content">
        {activeTab === 'users' && <ManageUsers />}
        {activeTab === 'features' && <ManageFeatures />}
        {activeTab === 'players' && <ManagePlayers />}
        {activeTab === 'divisions' && <ManageDivisions />}
        {activeTab === 'match-types' && <ManageMatchTypes />}
        {activeTab === 'schedule' && <ScheduleMatch />}
        {activeTab === 'results' && <RecordResult />}
        {activeTab === 'championships' && <ManageChampionships />}
        {activeTab === 'tournaments' && <CreateTournament />}
        {activeTab === 'challenges' && <AdminChallenges />}
        {activeTab === 'promos' && <AdminPromos />}
        {activeTab === 'guide' && <AdminGuide />}
        {activeTab === 'seasons' && <ManageSeasons />}
        {activeTab === 'events' && (
          <>
            <CreateEvent />
            <MatchCardBuilder />
          </>
        )}
        {activeTab === 'fantasy-shows' && <ManageFantasyShows />}
        {activeTab === 'fantasy-config' && <FantasyConfig />}
        {activeTab === 'contender-config' && <AdminContenderConfig />}
        {activeTab === 'danger' && <ClearAllData />}
      </div>
    </div>
  );
}
