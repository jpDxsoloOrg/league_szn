import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStats } from '../../hooks/usePlayerStats';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import PlayerStatsContent from './PlayerStatsContent';
import SeasonSelector from './SeasonSelector';
import './stats-common.css';
import './PlayerStats.css';

interface EmbeddedPlayerStatsProps {
  playerId: string;
}

function EmbeddedPlayerStats({ playerId }: EmbeddedPlayerStatsProps) {
  const { t } = useTranslation();

  const {
    data, loading, error, seasons, selectedSeasonId, setSelectedSeasonId,
    overallStats, matchTypeStats, championshipStats, achievements,
  } = usePlayerStats({ playerId });

  const player = useMemo(
    () => data?.players?.find((candidate) => candidate.playerId === playerId),
    [data, playerId]
  );

  if (loading && !overallStats) {
    return <Skeleton variant="block" count={3} />;
  }

  if (error) {
    return <EmptyState title={error} />;
  }

  if (!player || !overallStats) {
    return <EmptyState title={t('statistics.playerStats.title')} description={t('statistics.playerStats.noData')} />;
  }

  return (
    <div className="stats-page">
      <div className="ps-embedded-bar">
        <SeasonSelector
          seasons={seasons}
          selectedSeasonId={selectedSeasonId}
          onSeasonChange={setSelectedSeasonId}
        />
        <Button variant="ghost" to={`/stats/player/${playerId}`}>{t('publicProfile.fullStats')}</Button>
      </div>

      <PlayerStatsContent
        player={player}
        overallStats={overallStats}
        matchTypeStats={matchTypeStats}
        championshipStats={championshipStats}
        achievements={achievements}
      />
    </div>
  );
}

export default EmbeddedPlayerStats;
