import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tagTeamsApi } from '../../services/api';
import { logger } from '../../utils/logger';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { TagTeam } from '../../types/tagTeam';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import TagTeamCard from './TagTeamCard';
import TagTeamStandings from './TagTeamStandings';
import '../factions/groupUi.css';
import './TagTeamsList.css';

type ViewMode = 'list' | 'standings';

export default function TagTeamsList() {
  const { t } = useTranslation();
  useDocumentTitle(t('tagTeams.title', 'Tag Teams'));

  const [tagTeams, setTagTeams] = useState<TagTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchTagTeams = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await tagTeamsApi.getAll(undefined, abortController.signal);
        if (!abortController.signal.aborted) {
          setTagTeams(data.filter((team) => team.status === 'active'));
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Failed to load tag teams');
          setError(err.message || t('tagTeams.error', 'Failed to load tag teams'));
        }
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };

    fetchTagTeams();
    return () => abortController.abort();
  }, [t, reloadKey]);

  const renderList = () => {
    if (loading) return <Skeleton variant="cards" count={6} />;
    if (error) {
      return (
        <EmptyState
          title={t('common.error', 'Error')}
          description={error}
          actionLabel={t('common.retry', 'Retry')}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      );
    }
    if (tagTeams.length === 0) {
      return (
        <EmptyState
          title={t('tagTeams.title', 'Tag Teams')}
          description={t('tagTeams.noTeams', 'No active tag teams found.')}
        />
      );
    }
    return (
      <div className="tag-teams-list__grid">
        {tagTeams.map((team) => (
          <TagTeamCard key={team.tagTeamId} tagTeam={team} />
        ))}
      </div>
    );
  };

  return (
    <div className="group-page">
      <PageHeader
        title={t('tagTeams.title', 'Tag Teams')}
        actions={(
          <Tabs
            label={t('tagTeams.title', 'Tag Teams')}
            value={viewMode}
            onValueChange={(value) => setViewMode(value as ViewMode)}
            items={[
              { value: 'list', label: t('tagTeams.viewList', 'List') },
              { value: 'standings', label: t('tagTeams.viewStandings', 'Standings') },
            ]}
          />
        )}
      />
      {viewMode === 'standings' ? <TagTeamStandings /> : renderList()}
    </div>
  );
}
