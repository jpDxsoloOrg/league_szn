import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { stablesApi } from '../../services/api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { logger } from '../../utils/logger';
import type { Stable } from '../../types/stable';
import StableCard from './StableCard';
import StableStandings from './StableStandings';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import './StablesList.css';

type ViewMode = 'list' | 'standings';

export default function StablesList() {
  const { t } = useTranslation();
  useDocumentTitle(t('stables.title', 'Stables'));

  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const activeView: ViewMode = viewParam === 'standings' ? 'standings' : 'list';

  const [stables, setStables] = useState<Stable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchStables = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await stablesApi.getAll({ status: 'active' }, abortController.signal);
        if (!abortController.signal.aborted) {
          setStables(data);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load stables');
          setError(err.message || 'Failed to load stables');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchStables();
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
    return <Skeleton variant="cards" count={6} className="stables-skeleton" />;
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
    <div className="stables-list-container">
      <div className="stables-list-header">
        <h2>{t('stables.title', 'Stables')}</h2>
        <div className="stables-view-toggle">
          <button
            type="button"
            className={`btn ${activeView === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => switchView('list')}
          >
            {t('stables.viewList', 'List')}
          </button>
          <button
            type="button"
            className={`btn ${activeView === 'standings' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => switchView('standings')}
          >
            {t('stables.viewStandings', 'Standings')}
          </button>
        </div>
      </div>

      {activeView === 'standings' ? (
        <StableStandings />
      ) : (
        <>
          {stables.length === 0 ? (
            <EmptyState
              title={t('stables.title', 'Stables')}
              description={t('stables.noStables', 'No active stables yet.')}
            />
          ) : (
            <div className="stables-grid">
              {stables.map((stable) => (
                <StableCard key={stable.stableId} stable={stable} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
