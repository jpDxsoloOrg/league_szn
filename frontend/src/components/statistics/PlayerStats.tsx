import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { statisticsApi } from '../../services/api';
import { usePlayerStats } from '../../hooks/usePlayerStats';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import PlayerStatsContent from './PlayerStatsContent';
import SeasonSelector from './SeasonSelector';
import { useStatsResource } from './useStatsResource';
import './stats-common.css';

function PlayerStats() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playerId: routePlayerId } = useParams<{ playerId: string }>();

  const loadRoster = useCallback(
    async (signal: AbortSignal) => (await statisticsApi.getPlayerStats(undefined, undefined, signal)).players,
    [],
  );
  const roster = useStatsResource(loadRoster);
  const players = roster.data ?? [];
  const selectedPlayerId = routePlayerId ?? players[0]?.playerId ?? '';

  const {
    loading, error, seasons, selectedSeasonId, setSelectedSeasonId,
    overallStats, matchTypeStats, championshipStats, achievements,
  } = usePlayerStats({ playerId: selectedPlayerId });

  const player = players.find((candidate) => candidate.playerId === selectedPlayerId);

  const renderBody = () => {
    if (roster.failed) {
      return <EmptyState title={t('statistics.loadFailed')} actionLabel={t('common.retry')} onAction={roster.reload} />;
    }
    if (roster.loading) return <Skeleton variant="block" count={3} />;
    if (!selectedPlayerId) {
      return <EmptyState title={t('statistics.playerStats.title')} description={t('statistics.playerStats.noData')} />;
    }
    if (loading) return <Skeleton variant="block" count={3} />;
    if (error) return <EmptyState title={error} />;
    if (!player || !overallStats) {
      return <EmptyState title={t('statistics.playerStats.title')} description={t('statistics.playerStats.noData')} />;
    }
    return (
      <PlayerStatsContent
        player={player}
        overallStats={overallStats}
        matchTypeStats={matchTypeStats}
        championshipStats={championshipStats}
        achievements={achievements}
      />
    );
  };

  return (
    <div className="stats-page">
      <PageHeader
        eyebrow={t('nav.statistics')}
        title={t('statistics.playerStats.title')}
        actions={
          <>
            {players.length > 0 && (
              <Select
                label={t('statistics.playerStats.selectPlayer')}
                value={selectedPlayerId}
                onValueChange={(playerId) => navigate(`/stats/player/${playerId}`)}
                options={players.map((candidate) => ({
                  value: candidate.playerId,
                  label: `${candidate.name} (${candidate.wrestlerName})`,
                }))}
              />
            )}
            <SeasonSelector
              seasons={seasons}
              selectedSeasonId={selectedSeasonId}
              onSeasonChange={setSelectedSeasonId}
            />
          </>
        }
      />
      {renderBody()}
    </div>
  );
}

export default PlayerStats;
