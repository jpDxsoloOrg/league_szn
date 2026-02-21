import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayerStats } from '../../hooks/usePlayerStats';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import PlayerStatsContent from './PlayerStatsContent';
import SeasonSelector from './SeasonSelector';
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
    () => data?.players?.find((p) => p.playerId === playerId),
    [data, playerId]
  );

  if (loading && !overallStats) {
    return (
      <div className="player-stats">
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="player-stats">
        <p>{error}</p>
      </div>
    );
  }

  if (!player || !overallStats) {
    return (
      <div className="player-stats">
        <EmptyState
          title={t('statistics.playerStats.title')}
          description={t('statistics.playerStats.noData')}
        />
      </div>
    );
  }

  return (
    <div className="player-stats">
      <div className="ps-nav-links">
        <Link to="/stats/head-to-head">{t('statistics.nav.headToHead')}</Link>
        <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
        <Link to="/stats/match-types">{t('statistics.nav.matchTypeLeaderboards')}</Link>
        <Link to="/stats/rivalries">{t('statistics.nav.rivalries')}</Link>
        <Link to="/stats/tale-of-tape">{t('statistics.nav.taleOfTape')}</Link>
        <Link to="/stats/records">{t('statistics.nav.records')}</Link>
        <Link to="/stats/best-matches">{t('statistics.nav.bestMatches')}</Link>
        <Link to="/stats/achievements">{t('statistics.nav.achievements')}</Link>
      </div>

      <SeasonSelector
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onSeasonChange={setSelectedSeasonId}
        compact
      />

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
