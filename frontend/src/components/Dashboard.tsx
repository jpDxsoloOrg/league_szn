import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { dashboardApi } from '../services/api';
import type { DashboardData } from '../types';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';
import FindMatchWidget from './matchmaking/FindMatchWidget';
import ChampionCarousel from './ChampionCarousel';
import DashboardRivalries from './rivalries/DashboardRivalries';
import HomeHero from './home/HomeHero';
import LatestResults from './home/LatestResults';
import SeasonSummary from './home/SeasonSummary';
import TopOfTable from './home/TopOfTable';
import './Dashboard.css';

export default function Dashboard() {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.dashboard'));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  // Empty string means the request failed without a usable message.
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const result = await dashboardApi.get(signal);
      if (!signal?.aborted) setData(result);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : '');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard]);

  if (loading && !data) {
    return (
      <div className="home">
        <Skeleton variant="block" count={1} className="home-skeleton-hero" />
        <Skeleton variant="cards" count={4} />
      </div>
    );
  }

  if (error !== null && !data) {
    return (
      <div className="home">
        <EmptyState
          title={t('home.loadError')}
          description={error || undefined}
          actionLabel={t('common.retry')}
          onAction={() => void loadDashboard()}
        />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="home">
      <HomeHero inProgressEvents={data.inProgressEvents ?? []} upcomingEvents={data.upcomingEvents} />
      <ChampionCarousel champions={data.currentChampions} />
      <div className="home-columns">
        <LatestResults results={data.recentResults} />
        <TopOfTable seasonId={data.seasonInfo?.seasonId} seasonName={data.seasonInfo?.name} />
      </div>
      {/* Both gate themselves to logged-in wrestlers. */}
      <FindMatchWidget />
      <DashboardRivalries />
      <SeasonSummary season={data.seasonInfo} stats={data.quickStats} />
    </div>
  );
}
