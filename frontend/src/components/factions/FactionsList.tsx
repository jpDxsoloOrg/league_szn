import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { stablesApi } from '../../services/api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { logger } from '../../utils/logger';
import type { Stable } from '../../types/stable';
import FactionCard from './FactionCard';
import FactionStandings from './FactionStandings';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import './FactionsList.css';

type ViewMode = 'list' | 'standings';

export default function FactionsList() {
  const { t } = useTranslation();
  useDocumentTitle(t('stables.title', 'Stables'));

  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const activeView: ViewMode = viewParam === 'standings' ? 'standings' : 'list';

  const [factions, setFactions] = useState<Stable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchFactions = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await stablesApi.getAll(undefined, abortController.signal);
        if (!abortController.signal.aborted) {
          const visibleFactions = data.filter(
            (s) => s.status === 'active' || s.status === 'approved'
          );
          setFactions(visibleFactions);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load factions');
          setError(err.message || 'Failed to load factions');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchFactions();
    return () => abortController.abort();
  }, []);

  const switchView = (view: ViewMode) => {
    if (view === 'standings') {
      setSearchParams({ view: 'standings' });
    } else {
      setSearchParams({});
    }
  };

  if (loading && activeView === 'list') {
    return <Skeleton variant="cards" count={6} className="factions-skeleton" />;
  }

  if (error && activeView === 'list') {
    return (
      <div className="error">
        <p>{t('common.error', 'Error')}: {error}</p>
        <button onClick={() => window.location.reload()}>{t('common.retry', 'Retry')}</button>
      </div>
    );
  }

  return (
    <div className="factions-list-container">
      <div className="factions-list-header">
        <h2>{t('stables.title', 'Stables')}</h2>
        <div className="factions-view-toggle">
          <button
            type="button"
            className={`factions-toggle-btn ${activeView === 'list' ? 'factions-toggle-btn--active' : ''}`}
            onClick={() => switchView('list')}
          >
            {t('stables.viewList', 'List')}
          </button>
          <button
            type="button"
            className={`factions-toggle-btn ${activeView === 'standings' ? 'factions-toggle-btn--active' : ''}`}
            onClick={() => switchView('standings')}
          >
            {t('stables.viewStandings', 'Standings')}
          </button>
        </div>
      </div>

      {activeView === 'standings' ? (
        <FactionStandings />
      ) : (
        <>
          {factions.length === 0 ? (
            <EmptyState
              title={t('stables.title', 'Stables')}
              description={t('stables.noStables', 'No active stables yet.')}
            />
          ) : (
            <div className="factions-grid">
              {factions.map((faction) => (
                <FactionCard key={faction.stableId} faction={faction} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
