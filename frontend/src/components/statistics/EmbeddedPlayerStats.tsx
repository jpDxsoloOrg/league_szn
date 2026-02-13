import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayerStats } from '../../hooks/usePlayerStats';
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
    overallStats, matchTypeStats, maxWinsAcrossTypes, championshipStats, achievements,
  } = usePlayerStats({ playerId });

  const player = useMemo(
    () => data?.players?.find((p) => p.playerId === playerId),
    [data, playerId]
  );

  if (loading && !overallStats) {
    return (
      <div className="player-stats">
        <p>{t('common.loading', 'Loading...')}</p>
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
        <p>{t('statistics.playerStats.noData')}</p>
      </div>
    );
  }

  return (
    <div className="player-stats">
      <div className="ps-nav-links">
        <Link to="/stats/head-to-head">{t('statistics.nav.headToHead')}</Link>
        <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
        <Link to="/stats/tale-of-tape">{t('statistics.nav.taleOfTape')}</Link>
        <Link to="/stats/records">{t('statistics.nav.records')}</Link>
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
        maxWinsAcrossTypes={maxWinsAcrossTypes}
        championshipStats={championshipStats}
        achievements={achievements}
      />
    </div>
  );
}

export default EmbeddedPlayerStats;
