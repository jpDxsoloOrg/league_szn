import { useState } from 'react';
import { authApi } from '../../services/api';
import AdminLogin from './AdminLogin';
import ManagePlayers from './ManagePlayers';
import ManageDivisions from './ManageDivisions';
import ScheduleMatch from './ScheduleMatch';
import RecordResult from './RecordResult';
import ManageChampionships from './ManageChampionships';
import CreateTournament from './CreateTournament';
import './AdminPanel.css';

type AdminTab = 'players' | 'divisions' | 'schedule' | 'results' | 'championships' | 'tournaments';

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(authApi.isAuthenticated());
  const [activeTab, setActiveTab] = useState<AdminTab>('players');

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    authApi.clearToken();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={handleLogin} />;
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>Admin Panel</h2>
        <button onClick={handleLogout} className="logout-btn">
          Logout
        </button>
      </div>

      <div className="admin-tabs">
        <button
          className={`tab ${activeTab === 'players' ? 'active' : ''}`}
          onClick={() => setActiveTab('players')}
        >
          Manage Players
        </button>
        <button
          className={`tab ${activeTab === 'divisions' ? 'active' : ''}`}
          onClick={() => setActiveTab('divisions')}
        >
          Divisions
        </button>
        <button
          className={`tab ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          Schedule Match
        </button>
        <button
          className={`tab ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => setActiveTab('results')}
        >
          Record Results
        </button>
        <button
          className={`tab ${activeTab === 'championships' ? 'active' : ''}`}
          onClick={() => setActiveTab('championships')}
        >
          Championships
        </button>
        <button
          className={`tab ${activeTab === 'tournaments' ? 'active' : ''}`}
          onClick={() => setActiveTab('tournaments')}
        >
          Tournaments
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'players' && <ManagePlayers />}
        {activeTab === 'divisions' && <ManageDivisions />}
        {activeTab === 'schedule' && <ScheduleMatch />}
        {activeTab === 'results' && <RecordResult />}
        {activeTab === 'championships' && <ManageChampionships />}
        {activeTab === 'tournaments' && <CreateTournament />}
      </div>
    </div>
  );
}
