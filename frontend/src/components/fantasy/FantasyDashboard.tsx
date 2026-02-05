import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  mockCurrentFantasyUser,
  mockShowsWithDetails,
  mockUserPicks,
  mockWrestlersWithCosts,
  mockDivisions,
} from '../../mocks/fantasyMockData';
import './FantasyDashboard.css';

export default function FantasyDashboard() {
  const { t } = useTranslation();
  const user = mockCurrentFantasyUser;
  const upcomingShows = mockShowsWithDetails.filter((s) => s.status === 'open');
  const completedShows = mockShowsWithDetails.filter((s) => s.status === 'completed').slice(0, 3);
  const currentShow = upcomingShows[0];

  const getWrestlerName = (playerId: string): string => {
    const wrestler = mockWrestlersWithCosts.find((w) => w.playerId === playerId);
    return wrestler?.currentWrestler || 'Unknown';
  };

  const getDivisionName = (divisionId: string): string => {
    const division = mockDivisions.find((d) => d.divisionId === divisionId);
    return division?.name || 'Unknown';
  };

  const getCurrentPicks = () => {
    if (!currentShow) return null;
    return mockUserPicks.find((p) => p.showId === currentShow.showId);
  };

  const currentPicks = getCurrentPicks();

  return (
    <div className="fantasy-dashboard">
      <header className="dashboard-header">
        <div className="user-welcome">
          <h1>{t('fantasy.dashboard.welcome', { username: user.username })}</h1>
          <p className="season-points">
            {t('fantasy.dashboard.seasonPoints')}: <strong>{user.currentSeasonPoints}</strong>
          </p>
        </div>
        <div className="user-stats-quick">
          <div className="stat-pill">
            <span className="stat-icon">🔥</span>
            <span>{user.currentStreak} {t('fantasy.dashboard.streak')}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-icon">⭐</span>
            <span>{user.perfectPicks} {t('fantasy.dashboard.perfectPicks')}</span>
          </div>
        </div>
      </header>

      <div className="dashboard-grid">
        {/* Current/Upcoming Show */}
        <section className="dashboard-card upcoming-show-card">
          <h2>{t('fantasy.dashboard.upcomingShow')}</h2>
          {currentShow ? (
            <div className="show-preview">
              <div className="show-header">
                <span className="show-status open">{t('fantasy.showStatus.open')}</span>
                <h3>{currentShow.name}</h3>
                <p className="show-date">
                  {new Date(currentShow.date).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div className="show-details">
                <div className="detail-item">
                  <span className="label">{t('fantasy.dashboard.budget')}</span>
                  <span className="value">${currentShow.budget}</span>
                </div>
                <div className="detail-item">
                  <span className="label">{t('fantasy.dashboard.maxPerDivision')}</span>
                  <span className="value">{currentShow.picksPerDivision}</span>
                </div>
                <div className="detail-item">
                  <span className="label">{t('fantasy.dashboard.matches')}</span>
                  <span className="value">{currentShow.matchCount}</span>
                </div>
              </div>
              <Link to={`/fantasy/picks/${currentShow.showId}`} className="btn-action">
                {currentPicks
                  ? t('fantasy.dashboard.editPicks')
                  : t('fantasy.dashboard.makePicks')}
              </Link>
            </div>
          ) : (
            <div className="no-shows">
              <p>{t('fantasy.dashboard.noUpcomingShows')}</p>
            </div>
          )}
        </section>

        {/* Current Picks Preview */}
        <section className="dashboard-card picks-preview-card">
          <h2>{t('fantasy.dashboard.yourPicks')}</h2>
          {currentPicks ? (
            <div className="picks-preview">
              {Object.entries(currentPicks.picks).map(([divisionId, playerIds]) => (
                <div key={divisionId} className="division-picks">
                  <h4>{getDivisionName(divisionId)}</h4>
                  {playerIds.length > 0 ? (
                    <ul>
                      {playerIds.map((playerId) => (
                        <li key={playerId}>{getWrestlerName(playerId)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-picks">{t('fantasy.dashboard.noPicks')}</p>
                  )}
                </div>
              ))}
              <div className="picks-budget">
                <span>{t('fantasy.dashboard.spent')}: ${currentPicks.totalSpent}</span>
                <span className="remaining">
                  {t('fantasy.dashboard.remaining')}: $
                  {(currentShow?.budget ?? 0) - currentPicks.totalSpent}
                </span>
              </div>
            </div>
          ) : (
            <div className="no-picks-message">
              <p>{t('fantasy.dashboard.noPicksYet')}</p>
              {currentShow && (
                <Link to={`/fantasy/picks/${currentShow.showId}`} className="btn-secondary">
                  {t('fantasy.dashboard.startPicking')}
                </Link>
              )}
            </div>
          )}
        </section>

        {/* User Stats */}
        <section className="dashboard-card stats-card">
          <h2>{t('fantasy.dashboard.yourStats')}</h2>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-value">{user.totalPoints}</span>
              <span className="stat-label">{t('fantasy.dashboard.totalPoints')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{user.currentSeasonPoints}</span>
              <span className="stat-label">{t('fantasy.dashboard.thisSeasonPoints')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{user.perfectPicks}</span>
              <span className="stat-label">{t('fantasy.dashboard.perfectPicksLabel')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{user.bestStreak}</span>
              <span className="stat-label">{t('fantasy.dashboard.bestStreak')}</span>
            </div>
          </div>
          <Link to="/fantasy/leaderboard" className="view-link">
            {t('fantasy.dashboard.viewLeaderboard')}
          </Link>
        </section>

        {/* Recent Results */}
        <section className="dashboard-card recent-results-card">
          <h2>{t('fantasy.dashboard.recentResults')}</h2>
          <div className="results-list">
            {completedShows.map((show) => {
              const picks = mockUserPicks.find((p) => p.showId === show.showId);
              return (
                <div key={show.showId} className="result-item">
                  <div className="result-info">
                    <h4>{show.name}</h4>
                    <span className="result-date">
                      {new Date(show.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="result-points">
                    <span className="points-earned">+{picks?.pointsEarned || 0}</span>
                    <span className="points-label">{t('fantasy.dashboard.pts')}</span>
                  </div>
                  <Link to={`/fantasy/shows/${show.showId}/results`} className="view-results-link">
                    {t('fantasy.dashboard.viewDetails')}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Quick Links */}
      <nav className="dashboard-quick-links">
        <Link to="/fantasy/leaderboard" className="quick-link">
          <span className="quick-link-icon">🏆</span>
          <span>{t('fantasy.dashboard.leaderboard')}</span>
        </Link>
        <Link to="/fantasy/costs" className="quick-link">
          <span className="quick-link-icon">💰</span>
          <span>{t('fantasy.dashboard.wrestlerCosts')}</span>
        </Link>
        <Link to="/fantasy" className="quick-link">
          <span className="quick-link-icon">📋</span>
          <span>{t('fantasy.dashboard.howToPlay')}</span>
        </Link>
      </nav>
    </div>
  );
}
