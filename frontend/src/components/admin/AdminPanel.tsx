import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

import ManagePlayers from './ManagePlayers';
import ManageDivisions from './ManageDivisions';
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
import './AdminPanel.css';

import AdminContenderConfig from './AdminContenderConfig';

type AdminTab = 'players' | 'divisions' | 'schedule' | 'results' | 'championships' | 'tournaments' | 'challenges' | 'promos' | 'seasons' | 'events' | 'fantasy-shows' | 'fantasy-config' | 'contender-config' | 'guide' | 'danger' | 'users';

const VALID_TABS: AdminTab[] = ['players', 'divisions', 'schedule', 'results', 'championships', 'tournaments', 'challenges', 'promos', 'seasons', 'events', 'fantasy-shows', 'fantasy-config', 'contender-config', 'guide', 'danger', 'users'];


export default function AdminPanel() {
  const { tab } = useParams<{ tab: string }>();
  const { isAuthenticated, isAdmin } = useAuth();

  const activeTab: AdminTab = (tab && VALID_TABS.includes(tab as AdminTab)) ? tab as AdminTab : 'players';

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="admin-panel">
        <div className="access-denied">
          <h2>Admin Access Required</h2>
          <p>You need admin privileges to access this panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-content">
        {activeTab === 'users' && <ManageUsers />}
        {activeTab === 'players' && <ManagePlayers />}
        {activeTab === 'divisions' && <ManageDivisions />}
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
