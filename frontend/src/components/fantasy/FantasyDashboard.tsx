import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { fantasyApi, eventsApi, divisionsApi } from '../../services/api';
import type { LeagueEvent } from '../../types/event';
import type { WrestlerWithCost, FantasyPicks, FantasyConfig } from '../../types/fantasy';
import type { Division } from '../../types';
import './FantasyDashboard.css';

export default function FantasyDashboard() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [myPicks, setMyPicks] = useState<FantasyPicks[]>([]);
  const [wrestlers, setWrestlers] = useState<WrestlerWithCost[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [config, setConfig] = useState<FantasyConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        const [eventsData, picksData, wrestlersData, divisionsData, configData] =
          await Promise.all([
            eventsApi.getAll({}, controller.signal),
            fantasyApi.getAllMyPicks(controller.signal).catch(() => [] as FantasyPicks[]),
            fantasyApi.getWrestlerCosts(controller.signal),
            divisionsApi.getAll(controller.signal),
            fantasyApi.getConfig(controller.signal),
          ]);

        setEvents(eventsData as LeagueEvent[]);
        setWrestlers(wrestlersData);
        setDivisions(divisionsData);
        setConfig(configData);

        // Check if any completed events have unscored picks — trigger scoring
        const completed = (eventsData as LeagueEvent[]).filter((e) => e.status === 'completed');
        const hasUnscoredPicks = completed.some((evt) => {
          const pick = picksData.find((p) => p.eventId === evt.eventId);
          return pick && (pick.pointsEarned === undefined || pick.pointsEarned === null);
        });

        if (hasUnscoredPicks) {
          try {
            await fantasyApi.scoreCompletedEvents();
            // Re-fetch picks with updated scores
            const updatedPicks = await fantasyApi.getAllMyPicks(controller.signal).catch(() => [] as FantasyPicks[]);
            setMyPicks(updatedPicks);
          } catch {
            // Scoring may fail — still show the dashboard with original picks
            setMyPicks(picksData);
          }
        } else {
          setMyPicks(picksData);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => controller.abort();
  }, []);

  const upcomingEvents = events.filter((e) => e.status === 'upcoming');
  const completedEvents = events
    .filter((e) => e.status === 'completed' || e.status === 'in-progress')
    .slice(0, 3);
  const currentEvent = upcomingEvents[0];

  const getWrestlerName = (playerId: string): string => {
    const wrestler = wrestlers.find((w) => w.playerId === playerId);
    return wrestler?.currentWrestler || 'Unknown';
  };

  const getDivisionName = (divisionId: string): string => {
    const division = divisions.find((d) => d.divisionId === divisionId);
    return division?.name || 'Unknown';
  };

  const currentPicks = currentEvent
    ? myPicks.find((p) => p.eventId === currentEvent.eventId)
    : null;

  const budget = currentEvent?.fantasyBudget || config?.defaultBudget || 500;
  const picksPerDivision =
    currentEvent?.fantasyPicksPerDivision || config?.defaultPicksPerDivision || 2;

  // Compute basic stats from picks
  const totalPoints = myPicks.reduce((sum, p) => sum + (p.pointsEarned || 0), 0);
  const eventsParticipated = myPicks.length;

  if (loading) {
    return (
      <div className="fantasy-dashboard">
        <div className="loading-state">
          <div className="spinner" />
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fantasy-dashboard">
      <header className="dashboard-header">
        <div className="user-welcome">
          <h1>{t('fantasy.dashboard.welcome', { username: 'Player' })}</h1>
          <p className="season-points">
            {t('fantasy.dashboard.seasonPoints')}: <strong>{totalPoints}</strong>
          </p>
        </div>
        <div className="user-stats-quick">
          <div className="stat-pill">
            <span className="stat-icon">🔥</span>
            <span>{eventsParticipated} {t('fantasy.dashboard.streak')}</span>
          </div>
        </div>
      </header>

      <div className="dashboard-grid">
        {/* Current/Upcoming Event */}
        <section className="dashboard-card upcoming-show-card">
          <h2>{t('fantasy.dashboard.upcomingShow')}</h2>
          {currentEvent ? (
            <div className="show-preview">
              <div className="show-header">
                <span className="show-status open">{t('fantasy.showStatus.open')}</span>
                <h3>{currentEvent.name}</h3>
                <p className="show-date">
                  {new Date(currentEvent.date).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div className="show-details">
                <div className="detail-item">
                  <span className="label">{t('fantasy.dashboard.budget')}</span>
                  <span className="value">${budget}</span>
                </div>
                <div className="detail-item">
                  <span className="label">{t('fantasy.dashboard.maxPerDivision')}</span>
                  <span className="value">{picksPerDivision}</span>
                </div>
                <div className="detail-item">
                  <span className="label">{t('fantasy.dashboard.matches')}</span>
                  <span className="value">{currentEvent.matchCards?.length || 0}</span>
                </div>
              </div>
              <Link to={`/fantasy/picks/${currentEvent.eventId}`} className="btn-action">
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
                  {budget - currentPicks.totalSpent}
                </span>
              </div>
            </div>
          ) : (
            <div className="no-picks-message">
              <p>{t('fantasy.dashboard.noPicksYet')}</p>
              {currentEvent && (
                <Link to={`/fantasy/picks/${currentEvent.eventId}`} className="btn-secondary">
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
              <span className="stat-value">{totalPoints}</span>
              <span className="stat-label">{t('fantasy.dashboard.totalPoints')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{eventsParticipated}</span>
              <span className="stat-label">{t('fantasy.dashboard.thisSeasonPoints')}</span>
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
            {completedEvents.map((evt) => {
              const picks = myPicks.find((p) => p.eventId === evt.eventId);
              return (
                <div key={evt.eventId} className="result-item">
                  <div className="result-info">
                    <h4>{evt.name}</h4>
                    <span className="result-date">
                      {new Date(evt.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="result-points">
                    <span className="points-earned">+{picks?.pointsEarned || 0}</span>
                    <span className="points-label">{t('fantasy.dashboard.pts')}</span>
                  </div>
                  <Link to={`/fantasy/events/${evt.eventId}/results`} className="view-results-link">
                    {t('fantasy.dashboard.viewDetails')}
                  </Link>
                </div>
              );
            })}
            {completedEvents.length === 0 && (
              <p className="no-results">{t('fantasy.dashboard.noUpcomingShows')}</p>
            )}
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
