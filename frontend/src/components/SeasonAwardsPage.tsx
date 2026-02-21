import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { seasonsApi } from '../services/api';
import type { Season } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import SeasonSelector from './statistics/SeasonSelector';
import SeasonAwards from './SeasonAwards';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';

export default function SeasonAwardsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('seasonAwards.title'));

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchSeasons = async () => {
      try {
        setLoading(true);
        setError(null);
        const seasonsData = await seasonsApi.getAll(abortController.signal);
        if (abortController.signal.aborted) {
          return;
        }

        setSeasons(seasonsData);

        const activeSeason = seasonsData.find((season) => season.status === 'active');
        const defaultSeason = activeSeason ?? seasonsData[0];
        if (defaultSeason) {
          setSelectedSeasonId(defaultSeason.seasonId);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message || 'Failed to load seasons');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchSeasons();
    return () => abortController.abort();
  }, []);

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.seasonId === selectedSeasonId),
    [seasons, selectedSeasonId]
  );

  if (loading) {
    return (
      <div className="season-awards-page">
        <h2>{t('seasonAwards.title')}</h2>
        <Skeleton variant="block" count={2} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="season-awards-page">
        <h2>{t('seasonAwards.title')}</h2>
        <p>{t('common.error')}: {error}</p>
      </div>
    );
  }

  if (seasons.length === 0) {
    return (
      <div className="season-awards-page">
        <EmptyState
          title={t('seasonAwards.title')}
          description={t('standings.noPlayers')}
        />
      </div>
    );
  }

  return (
    <div className="season-awards-page">
      <h2>{t('seasonAwards.title')}</h2>
      <SeasonSelector
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onSeasonChange={setSelectedSeasonId}
      />
      {selectedSeason ? <SeasonAwards season={selectedSeason} /> : null}
    </div>
  );
}
