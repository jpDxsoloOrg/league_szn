import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../services/api';
import { cognitoAuth } from '../../services/cognito';
import AdminLogin from './AdminLogin';
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
import './AdminPanel.css';

import AdminContenderConfig from './AdminContenderConfig';

type AdminTab = 'players' | 'divisions' | 'schedule' | 'results' | 'championships' | 'tournaments' | 'challenges' | 'promos' | 'seasons' | 'events' | 'fantasy-shows' | 'fantasy-config' | 'contender-config' | 'guide' | 'danger';

const VALID_TABS: AdminTab[] = ['players', 'divisions', 'schedule', 'results', 'championships', 'tournaments', 'challenges', 'promos', 'seasons', 'events', 'fantasy-shows', 'fantasy-config', 'contender-config', 'guide', 'danger'];


export default function AdminPanel() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(authApi.isAuthenticated());

  const activeTab: AdminTab = (tab && VALID_TABS.includes(tab as AdminTab)) ? tab as AdminTab : 'players';

  const handleLogin = () => {
    setIsAuthenticated(true);
    // After login, redirect to default admin page
    navigate('/admin/players');
  };

  const handleLogout = async () => {
    await cognitoAuth.signOut();
    authApi.clearToken();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={handleLogin} />;
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>{t('admin.panel.title')}</h2>
        <button onClick={handleLogout} className="logout-btn">
          {t('common.logout')}
        </button>
      </div>

      <div className="admin-content">
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
