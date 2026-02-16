import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../services/api';
import type { DashboardData, DashboardEvent } from '../types';
import './Dashboard.css';

function formatCountdown(dateStr: string, currentTime: number, t: (key: string) => string): string {
  const target = new Date(dateStr).getTime();
  if (target <= currentTime) return '—';
  const d = Math.floor((target - currentTime) / 86400000);
  const h = Math.floor(((target - currentTime) % 86400000) / 3600000);
  const m = Math.floor(((target - currentTime) % 3600000) / 60000);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}${t('dashboard.countdown.days')}`);
  parts.push(`${h}${t('dashboard.countdown.hours')}`);
  parts.push(`${m}${t('dashboard.countdown.minutes')}`);
  return parts.join(' ');
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await dashboardApi.get();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await dashboardApi.get(abortController.signal);
        if (!abortController.signal.aborted) setData(result);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message || 'Failed to load dashboard');
        }
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };
    fetchData();
    return () => abortController.abort();
  }, []);

  // Update countdown every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="dashboard-container dashboard-loading">
        <h1 className="dashboard-title">{t('dashboard.title')}</h1>
        <div className="dashboard-section" />
        <div className="dashboard-section" />
        <div className="dashboard-section" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="dashboard-container">
        <h1 className="dashboard-title">{t('dashboard.title')}</h1>
        <div className="dashboard-error">
          <p>{error}</p>
          <button type="button" onClick={loadDashboard}>
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">{t('dashboard.title')}</h1>

      <section className="dashboard-section">
        <h3>{t('dashboard.champions')}</h3>
        {data.currentChampions.length === 0 ? (
          <p className="dashboard-empty">{t('dashboard.noChampions')}</p>
        ) : (
          <div className="dashboard-champions-strip">
            {data.currentChampions.map((c) => (
              <div key={c.championshipId} className="dashboard-champion-card">
                <div className="champ-belt">{c.championshipName}</div>
                {c.championImageUrl ? (
                  <img src={c.championImageUrl} alt="" />
                ) : (
                  <div className="champ-placeholder" style={{ width: 64, height: 64, margin: '0 auto 0.5rem', background: '#333', borderRadius: 4 }} />
                )}
                <div className="champ-name">{c.championName}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <h3>{t('dashboard.upcomingEvents')}</h3>
        {data.upcomingEvents.length === 0 ? (
          <p className="dashboard-empty">{t('dashboard.noUpcomingEvents')}</p>
        ) : (
          <div className="dashboard-events-grid">
            {data.upcomingEvents.map((e: DashboardEvent) => (
              <Link key={e.eventId} to={`/events/${e.eventId}`} className="dashboard-event-card">
                <div className="event-name">{e.name}</div>
                <div className="event-date">{new Date(e.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</div>
                <div className="event-countdown">{formatCountdown(e.date, now, t)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <h3>{t('dashboard.recentResults')}</h3>
        {data.recentResults.length === 0 ? (
          <p className="dashboard-empty">{t('dashboard.noRecentResults')}</p>
        ) : (
          <div className="dashboard-results-list">
            {data.recentResults.map((m) => (
              <Link
                key={m.matchId}
                to={m.eventId ? `/events/${m.eventId}` : '/events'}
                className="dashboard-result-card"
              >
                <span className="result-winner">{m.winnerName}</span>
                <span className="result-vs">{t('dashboard.vs')}</span>
                <span className="result-loser">{m.loserName}</span>
                {m.championshipName && <span className="result-type">({m.championshipName})</span>}
                {!m.championshipName && <span className="result-type">{m.matchType}</span>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <h3>{t('dashboard.seasonProgress')}</h3>
        {!data.seasonInfo ? (
          <p className="dashboard-empty">{t('dashboard.noActiveSeason')}</p>
        ) : (
          <div className="dashboard-season-card">
            <div className="season-name">{data.seasonInfo.name}</div>
            <div className="season-meta">
              {t('dashboard.seasonStart')}: {data.seasonInfo.startDate ? new Date(data.seasonInfo.startDate).toLocaleDateString() : '—'}
              {' · '}
              {t('dashboard.matchesPlayed')}: {data.seasonInfo.matchesPlayed ?? 0}
            </div>
            <div className="season-progress-bar">
              <div
                className="season-progress-fill"
                style={{ width: data.seasonInfo.matchesPlayed ? `${Math.min(100, (data.seasonInfo.matchesPlayed / 50) * 100)}%` : '0%' }}
              />
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <h3>{t('dashboard.quickStats')}</h3>
        <div className="dashboard-quick-stats">
          <div className="dashboard-stat-card">
            <div className="stat-value">{data.quickStats.totalPlayers}</div>
            <div className="stat-label">{t('standings.table.player')}</div>
          </div>
          <div className="dashboard-stat-card">
            <div className="stat-value">{data.quickStats.totalMatches}</div>
            <div className="stat-label">{t('dashboard.matchesPlayed')}</div>
          </div>
          <div className="dashboard-stat-card">
            <div className="stat-value">{data.quickStats.activeChampionships}</div>
            <div className="stat-label">{t('dashboard.champions')}</div>
          </div>
          {data.quickStats.mostWinsPlayer && (
            <div className="dashboard-stat-card">
              <div className="stat-value">{data.quickStats.mostWinsPlayer.wins}</div>
              <div className="stat-label">{t('dashboard.mostWins')}: {data.quickStats.mostWinsPlayer.name}</div>
            </div>
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <h3>{t('dashboard.activeChallenges')}</h3>
        <Link to="/challenges" className="dashboard-challenges-cta">
          {data.activeChallengesCount > 0 && <span className="badge">{data.activeChallengesCount}</span>}
          {t('dashboard.viewAll')}
        </Link>
      </section>
    </div>
  );
}
