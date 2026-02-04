import { useState } from 'react';
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

import ManageSeasons from './ManageSeasons';
import AdminGuide from './AdminGuide';
import ClearAllData from './ClearAllData';
import './AdminPanel.css';

type AdminTab = 'players' | 'divisions' | 'schedule' | 'results' | 'championships' | 'tournaments' | 'seasons' | 'guide' | 'danger';


export default function AdminPanel() {
  const { t } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState(authApi.isAuthenticated());
  const [activeTab, setActiveTab] = useState<AdminTab>('players');

  const handleLogin = () => {
    setIsAuthenticated(true);
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

      <div className="admin-tabs">
        <button
          className={`tab ${activeTab === 'players' ? 'active' : ''}`}
          onClick={() => setActiveTab('players')}
        >
          {t('admin.panel.tabs.managePlayers')}
        </button>
        <button
          className={`tab ${activeTab === 'divisions' ? 'active' : ''}`}
          onClick={() => setActiveTab('divisions')}
        >
          {t('admin.panel.tabs.divisions')}
        </button>
        <button
          className={`tab ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          {t('admin.panel.tabs.scheduleMatch')}
        </button>
        <button
          className={`tab ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => setActiveTab('results')}
        >
          {t('admin.panel.tabs.recordResults')}
        </button>
        <button
          className={`tab ${activeTab === 'championships' ? 'active' : ''}`}
          onClick={() => setActiveTab('championships')}
        >
          {t('admin.panel.tabs.championships')}
        </button>
        <button
          className={`tab ${activeTab === 'tournaments' ? 'active' : ''}`}
          onClick={() => setActiveTab('tournaments')}
        >
          {t('admin.panel.tabs.tournaments')}
        </button>
        <button
          className={`tab ${activeTab === 'seasons' ? 'active' : ''}`}
          onClick={() => setActiveTab('seasons')}
        >
          {t('admin.panel.tabs.seasons')}
        </button>
        <button
          className={`tab ${activeTab === 'guide' ? 'active' : ''}`}
          onClick={() => setActiveTab('guide')}
        >
          {t('admin.panel.tabs.help')}
        </button>
        <button
          className={`tab danger ${activeTab === 'danger' ? 'active' : ''}`}
          onClick={() => setActiveTab('danger')}
        >
          {t('admin.panel.tabs.dangerZone')}
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'players' && <ManagePlayers />}
        {activeTab === 'divisions' && <ManageDivisions />}
        {activeTab === 'schedule' && <ScheduleMatch />}
        {activeTab === 'results' && <RecordResult />}
        {activeTab === 'championships' && <ManageChampionships />}
        {activeTab === 'tournaments' && <CreateTournament />}
        {activeTab === 'guide' && <AdminGuide />}
        {activeTab === 'seasons' && <ManageSeasons />}
        {activeTab === 'danger' && <ClearAllData />}
      </div>
    </div>
  );
}
