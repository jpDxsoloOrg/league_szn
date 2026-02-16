import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { rivalriesApi, seasonsApi } from '../../services/api';
import type { Rivalry } from '../../services/api/rivalries.api';
import type { Season } from '../../types';
import SeasonSelector from '../statistics/SeasonSelector';
import RivalryCard from './RivalryCard';
import './Rivalries.css';

export default function Rivalries() {
  const { t } = useTranslation();
  const [rivalries, setRivalries] = useState<Rivalry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');

  useEffect(() => {
    const abortController = new AbortController();
    const fetchSeasons = async () => {
      try {
        const list = await seasonsApi.getAll(abortController.signal);
        setSeasons(list);
      } catch {
        // ignore
      }
    };
    fetchSeasons();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    setLoading(true);
    setError(null);
    rivalriesApi
      .getRivalries(selectedSeasonId || undefined, abortController.signal)
      .then((res) => {
        setRivalries(res.rivalries);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
      })
      .finally(() => {
        setLoading(false);
      });
    return () => abortController.abort();
  }, [selectedSeasonId]);

  const featured = rivalries.length > 0 ? rivalries[0] : null;
  const rest = rivalries.length > 1 ? rivalries.slice(1) : [];

  if (loading && rivalries.length === 0) {
    return (
      <div className="rivalries-page">
        <h2>{t('rivalries.title')}</h2>
        <p>{t('rivalries.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rivalries-page">
        <h2>{t('rivalries.title')}</h2>
        <p className="rivalries-page__error">{error}</p>
      </div>
    );
  }

  return (
    <div className="rivalries-page">
      <div className="rivalries-page__header">
        <h2>{t('rivalries.title')}</h2>
        <div className="rivalries-page__nav">
          <Link to="/stats">{t('nav.statistics')}</Link>
          <Link to="/stats/head-to-head">{t('statistics.nav.headToHead')}</Link>
          <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
        </div>
      </div>
      {seasons.length > 0 && (
        <div className="rivalries-page__season">
          <SeasonSelector
            seasons={seasons}
            selectedSeasonId={selectedSeasonId}
            onSeasonChange={setSelectedSeasonId}
          />
        </div>
      )}
      {rivalries.length === 0 ? (
        <p className="rivalries-page__empty">{t('rivalries.noRivalries')}</p>
      ) : (
        <div className="rivalries-page__grid">
          {featured && <RivalryCard rivalry={featured} featured />}
          {rest.map((r) => (
            <RivalryCard key={`${r.playerIds[0]}-${r.playerIds[1]}`} rivalry={r} />
          ))}
        </div>
      )}
    </div>
  );
}
