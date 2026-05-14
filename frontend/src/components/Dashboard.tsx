import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { dashboardApi } from '../services/api';
import type { DashboardData, DashboardEvent, DashboardMatch } from '../types';
import {
  DEFAULT_CHAMPIONSHIP_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../constants/imageFallbacks';
import Skeleton from './ui/Skeleton';
import FindMatchWidget from './matchmaking/FindMatchWidget';
import ChampionCarousel from './ChampionCarousel';
import { formatCalendarDate } from '../utils/dateUtils';
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

function SeasonProgressRing({ startDate, endDate, label }: { startDate?: string; endDate?: string; label: string }) {
  const now = Date.now();
  let pct = 0;
  if (startDate && endDate) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (end > start) {
      pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
    }
  }
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="season-ring-wrapper">
      <svg className="season-ring" viewBox="0 0 120 120">
        <circle className="season-ring-bg" cx="60" cy="60" r={r} />
        <circle
          className="season-ring-fill"
          cx="60" cy="60" r={r}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="season-ring-text">
        <span className="season-ring-value">{Math.round(pct)}%</span>
        <span className="season-ring-label">{label}</span>
      </div>
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

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="dashboard">
        <Skeleton variant="block" count={4} className="dashboard-skeleton" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="dashboard">
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
    <div className="dashboard">

      {/* ROW 1 — Hero: Champion Carousel */}
      <ChampionCarousel champions={data.currentChampions} />

      {/* ROW 2 — Events + Quick Stats */}
      <div className="db-row-2">
        <section className="db-events">
          <h3 className="db-section-title">{t('dashboard.whatsHappening', "What's Happening")}</h3>

          {data.inProgressEvents && data.inProgressEvents.length > 0 && (
            <div className="db-live-events">
              {data.inProgressEvents.map((e: DashboardEvent) => (
                <Link
                  key={e.eventId}
                  to={`/events/${e.eventId}`}
                  className="db-event-card db-event-card--live"
                >
                  <span className="db-live-badge">{t('dashboard.liveBadge')}</span>
                  <div className="db-event-name">{e.name}</div>
                  <div className="db-event-date">{formatCalendarDate(e.date, undefined, { dateStyle: 'medium' })}</div>
                </Link>
              ))}
            </div>
          )}

          {data.upcomingEvents.length === 0 && (!data.inProgressEvents || data.inProgressEvents.length === 0) ? (
            <div className="db-empty-block">
              <p className="db-empty-text">{t('dashboard.noUpcomingEvents')}</p>
              <Link className="db-empty-action" to="/events">
                {t('dashboard.emptyActions.viewEvents', 'View events')}
              </Link>
            </div>
          ) : (
            <div className="db-upcoming-list">
              {data.upcomingEvents.map((e: DashboardEvent) => (
                <Link key={e.eventId} to={`/events/${e.eventId}`} className="db-event-card">
                  <div className="db-event-name">{e.name}</div>
                  <div className="db-event-countdown">{formatCountdown(e.date, now, t)}</div>
                  <div className="db-event-date">{formatCalendarDate(e.date, undefined, { dateStyle: 'medium' })}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="db-stats">
          <h3 className="db-section-title">{t('dashboard.quickStats')}</h3>
          <div className="db-stats-grid">
            <div className="db-stat-card">
              <div className="db-stat-value">{data.quickStats.totalPlayers}</div>
              <div className="db-stat-label">{t('standings.table.player')}</div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-value">{data.quickStats.totalMatches}</div>
              <div className="db-stat-label">{t('dashboard.matchesPlayed')}</div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-value">{data.quickStats.activeChampionships}</div>
              <div className="db-stat-label">{t('dashboard.champions')}</div>
            </div>
            {data.quickStats.mostWinsPlayer && (
              <div className="db-stat-card">
                <div className="db-stat-value">{data.quickStats.mostWinsPlayer.wins}</div>
                <div className="db-stat-label">{t('dashboard.mostWins')}: {data.quickStats.mostWinsPlayer.name}</div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Find Match widget — self-gates on wrestler + playerId */}
      <FindMatchWidget />

      {/* ROW 3 — Recent Results (horizontal scroll) */}
      <section className="db-results">
        <h3 className="db-section-title">{t('dashboard.recentResults')}</h3>
        {data.recentResults.length === 0 ? (
          <div className="db-empty-block">
            <p className="db-empty-text">{t('dashboard.noRecentResults')}</p>
            <Link className="db-empty-action" to="/matches">
              {t('dashboard.emptyActions.browseMatches', 'Browse matches')}
            </Link>
          </div>
        ) : (
          <div className="db-results-scroll">
            {data.recentResults.slice(0, 8).map((m: DashboardMatch) => (
              <Link
                key={m.matchId}
                to={m.eventId ? `/events/${m.eventId}` : '/events'}
                className="db-result-card"
              >
                <div className="db-result-outcome">
                  <span className="db-result-winner">{m.winnerName}</span>
                  <span className="db-result-vs">def.</span>
                  <span className="db-result-loser">{m.loserName}</span>
                </div>
                <div className="db-result-type">
                  {m.matchType}
                  {m.stipulation ? ` — ${m.stipulation}` : ''}
                </div>
                <div className="db-result-footer">
                  {m.isChampionship && (
                    <img
                      src={resolveImageSrc(m.championshipImageUrl, DEFAULT_CHAMPIONSHIP_IMAGE)}
                      onError={(event) => applyImageFallback(event, DEFAULT_CHAMPIONSHIP_IMAGE)}
                      alt={m.championshipName ?? ''}
                      className="db-result-belt"
                      title={m.championshipName}
                    />
                  )}
                  {m.starRating != null && (
                    <span className="db-result-stars" title={t('match.starRating')}>
                      {renderStarRating(m.starRating)}
                    </span>
                  )}
                  {m.matchOfTheNight && (
                    <span className="db-result-motn">{t('match.matchOfTheNightBadge')}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ROW 4 — Season Progress */}
      <section className="db-season">
        <h3 className="db-section-title">{t('dashboard.seasonProgress')}</h3>
        {!data.seasonInfo ? (
          <div className="db-empty-block">
            <p className="db-empty-text">{t('dashboard.noActiveSeason')}</p>
            <Link className="db-empty-action" to="/guide/wiki/getting-started">
              {t('dashboard.emptyActions.seeGuide', 'See getting started')}
            </Link>
          </div>
        ) : (
          <div className="db-season-content">
            <SeasonProgressRing
              startDate={data.seasonInfo.startDate}
              endDate={data.seasonInfo.endDate}
              label={t('dashboard.seasonProgress')}
            />
            <div className="db-season-info">
              <div className="db-season-name">{data.seasonInfo.name}</div>
              <div className="db-season-meta">
                {t('dashboard.seasonStart')}: {data.seasonInfo.startDate ? new Date(data.seasonInfo.startDate).toLocaleDateString() : '—'}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
