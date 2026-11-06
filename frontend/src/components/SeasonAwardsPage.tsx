import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { seasonsApi } from '../services/api';
import type { Season } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import SeasonAwards from './SeasonAwards';
import EmptyState from './ui/EmptyState';
import PageHeader from './ui/PageHeader';
import Select from './ui/Select';
import Skeleton from './ui/Skeleton';

export default function SeasonAwardsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('seasonAwards.title'));

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchSeasons = async () => {
      try {
        setLoading(true);
        setError(null);
        const seasonsData = await seasonsApi.getAll(abortController.signal);
        if (abortController.signal.aborted) return;

        setSeasons(seasonsData);
        const defaultSeason = seasonsData.find((season) => season.status === 'active') ?? seasonsData[0];
        if (defaultSeason) setSelectedSeasonId(defaultSeason.seasonId);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };

    fetchSeasons();
    return () => abortController.abort();
  }, [reloadCount]);

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.seasonId === selectedSeasonId),
    [seasons, selectedSeasonId],
  );

  const seasonOptions = seasons.map((season) => ({
    value: season.seasonId,
    label: season.status === 'active' ? `${season.name} (${t('common.active')})` : season.name,
  }));

  const renderContent = () => {
    if (loading) return <Skeleton variant="block" count={2} />;

    if (error !== null) {
      return (
        <EmptyState
          title={t('common.error')}
          description={error || t('seasonAwards.seasonsLoadFailed')}
          actionLabel={t('common.retry')}
          onAction={() => setReloadCount((count) => count + 1)}
        />
      );
    }

    if (!selectedSeason) {
      return <EmptyState title={t('seasonAwards.emptyTitle')} description={t('seasonAwards.noSeasons')} />;
    }

    return <SeasonAwards season={selectedSeason} />;
  };

  return (
    <div className="season-awards-page">
      <PageHeader
        title={t('seasonAwards.title')}
        actions={seasons.length > 0 ? (
          <Select
            label={t('standings.season')}
            value={selectedSeasonId}
            onValueChange={setSelectedSeasonId}
            options={seasonOptions}
          />
        ) : undefined}
      />
      {renderContent()}
    </div>
  );
}
