import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tagTeamsApi } from '../../services/api';
import { logger } from '../../utils/logger';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { TagTeam } from '../../types/tagTeam';
import TagTeamCard from './TagTeamCard';
import TagTeamStandings from './TagTeamStandings';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import './TagTeamsList.css';

type ViewMode = 'list' | 'standings';

export default function TagTeamsList() {
  const { t } = useTranslation();
  useDocumentTitle(t('tagTeams.title', 'Tag Teams'));

  const [tagTeams, setTagTeams] = useState<TagTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  useEffect(() => {
    const abortController = new AbortController();

    const fetchTagTeams = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await tagTeamsApi.getAll(undefined, abortController.signal);
        if (!abortController.signal.aborted) {
          setTagTeams(data.filter((tt) => tt.status === 'active'));
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load tag teams');
          setError(err.message || t('tagTeams.error', 'Failed to load tag teams'));
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchTagTeams();
    return () => abortController.abort();
  }, [t]);

  if (loading && viewMode === 'list') {
    return (
      <div className="tag-teams-list-container">
        <div className="tag-teams-list__header">
          <h2>{t('tagTeams.title', 'Tag Teams')}</h2>
        </div>
        <Skeleton variant="cards" count={6} className="tag-teams-list-skeleton" />
      </div>
    );
  }

  if (error && viewMode === 'list') {
    return (
      <div className="tag-teams-list-container">
        <div className="tag-teams-list__header">
          <h2>{t('tagTeams.title', 'Tag Teams')}</h2>
        </div>
        <div className="error">
          <p>{t('common.error', 'Error')}: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tag-teams-list-container">
      <div className="tag-teams-list__header">
        <h2>{t('tagTeams.title', 'Tag Teams')}</h2>
        <div className="tag-teams-list__view-toggle">
          <button
            className={`tag-teams-list__toggle-btn ${viewMode === 'list' ? 'tag-teams-list__toggle-btn--active' : ''}`}
            onClick={() => setViewMode('list')}
            type="button"
          >
            {t('tagTeams.viewList', 'List')}
          </button>
          <button
            className={`tag-teams-list__toggle-btn ${viewMode === 'standings' ? 'tag-teams-list__toggle-btn--active' : ''}`}
            onClick={() => setViewMode('standings')}
            type="button"
          >
            {t('tagTeams.viewStandings', 'Standings')}
          </button>
        </div>
      </div>

      {viewMode === 'standings' ? (
        <TagTeamStandings />
      ) : (
        <>
          {tagTeams.length === 0 ? (
            <EmptyState
              title={t('tagTeams.title', 'Tag Teams')}
              description={t('tagTeams.noTeams', 'No active tag teams found.')}
            />
          ) : (
            <div className="tag-teams-list__grid">
              {tagTeams.map((team) => (
                <TagTeamCard key={team.tagTeamId} tagTeam={team} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
