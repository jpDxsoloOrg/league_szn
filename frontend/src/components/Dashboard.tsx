import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { dashboardApi } from '../services/api';
import type { DashboardData, DashboardEvent, DashboardMatch } from '../types';
import './Dashboard.css';

function renderStarRating(rating: number): string {
  const stars: string[] = [];
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      stars.push('\u2605');
    } else if (i === Math.ceil(rating) && rating % 1 >= 0.5) {
      stars.push('\u2605');
    } else {
      stars.push('\u2606');
    }
  }
  return stars.join('');
}

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

function groupResultsByDate(results: DashboardMatch[]): { dateKey: string; dateLabel: string; matches: DashboardMatch[] }[] {
  const byDate = new Map<string, DashboardMatch[]>();
  for (const m of results) {
    const key = m.date.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(m);
  }
  const sortedKeys = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
  return sortedKeys.map((dateKey) => ({
    dateKey,
    dateLabel: new Date(dateKey + 'T12:00:00').toLocaleDateString(undefined, { dateStyle: 'long' }),
    matches: byDate.get(dateKey)!,
  }));
}

function RecentResultsGrouped({
  results,
  t,
  renderStarRating,
}: {
  results: DashboardMatch[];
  t: (key: string) => string;
  renderStarRating: (rating: number) => string;
}) {
  const groups = useMemo(() => groupResultsByDate(results), [results]);
  return (
    <div className="dashboard-results-by-date">
      {groups.map(({ dateKey, dateLabel, matches }) => (
        <div key={dateKey} className="dashboard-results-date-group">
          <div className="dashboard-results-date-separator">{dateLabel}</div>
          <div className="dashboard-results-list">
            {matches.map((m) => (
              <Link
                key={m.matchId}
                to={m.eventId ? `/events/${m.eventId}` : '/events'}
                className="dashboard-result-card"
              >
                <div className="dashboard-result-outcome">
                  <span className="result-winner">{m.winnerName}</span>
                  <span className="result-vs">{t('dashboard.vs')}</span>
                  <span className="result-loser">{m.loserName}</span>
                </div>
                <div className="dashboard-result-meta">
                  <span className="result-type">
                    {m.matchType}
                    {m.stipulation ? ` – ${m.stipulation}` : ''}
                  </span>
                  {m.isChampionship &&
                    (m.championshipImageUrl ? (
                      <img
                        src={m.championshipImageUrl}
                        alt={m.championshipName ?? ''}
                        className="result-championship-image"
                        title={m.championshipName}
                      />
                    ) : (
                      m.championshipName && (
                        <span className="result-championship-name">{m.championshipName}</span>
                      )
                    ))}
                  {(m.starRating != null || m.matchOfTheNight) && (
                    <div className="dashboard-result-awards">
                      {m.starRating != null && (
                        <span className="result-star-rating" title={t('match.starRating')}>
                          {renderStarRating(m.starRating)}
                          <span className="result-star-value">{m.starRating}</span>
                        </span>
                      )}
                      {m.matchOfTheNight && (
                        <span className="result-motn-badge">{t('match.matchOfTheNightBadge')}</span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.dashboard'));
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
          <RecentResultsGrouped results={data.recentResults} t={t} renderStarRating={renderStarRating} />
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
