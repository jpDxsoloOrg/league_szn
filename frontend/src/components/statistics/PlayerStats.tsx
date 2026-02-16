import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { statisticsApi } from '../../services/api';
import type { StatsPlayer } from '../../services/api';
import { usePlayerStats } from '../../hooks/usePlayerStats';
import PlayerStatsContent from './PlayerStatsContent';
import SeasonSelector from './SeasonSelector';
import './PlayerStats.css';

function PlayerStats() {
  const { t } = useTranslation();
  const { playerId: routePlayerId } = useParams<{ playerId: string }>();
  const [selectedPlayerId, setSelectedPlayerId] = useState(routePlayerId || '');
  const [players, setPlayers] = useState<StatsPlayer[]>([]);

  const {
    loading, error, seasons, selectedSeasonId, setSelectedSeasonId,
    overallStats, matchTypeStats, championshipStats, achievements,
  } = usePlayerStats({ playerId: selectedPlayerId });

  // Load player list on mount (unique to full page)
  useEffect(() => {
    const abortController = new AbortController();
    const fetchPlayers = async () => {
      try {
        const result = await statisticsApi.getPlayerStats(undefined, undefined, abortController.signal);
        setPlayers(result.players);
        if (!selectedPlayerId && result.players.length > 0 && result.players[0]) {
          setSelectedPlayerId(result.players[0].playerId);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          // Error handled by hook
        }
      }
    };
    fetchPlayers();
    return () => abortController.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const player = useMemo(
    () => players.find((p) => p.playerId === selectedPlayerId),
    [players, selectedPlayerId]
  );

  if (loading && !overallStats) {
    return (
      <div className="player-stats">
        <h2>{t('statistics.playerStats.title')}</h2>
        <p>{t('common.loading', 'Loading...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="player-stats">
        <h2>{t('statistics.playerStats.title')}</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!player || !overallStats) {
    return (
      <div className="player-stats">
        <h2>{t('statistics.playerStats.title')}</h2>
        <p>{t('statistics.playerStats.noData')}</p>
      </div>
    );
  }

  return (
    <div className="player-stats">
      <div className="ps-header">
        <h2>{t('statistics.playerStats.title')}</h2>
        <div className="ps-nav-links">
          <Link to="/stats/head-to-head">{t('statistics.nav.headToHead')}</Link>
          <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
          <Link to="/stats/rivalries">{t('statistics.nav.rivalries')}</Link>
          <Link to="/stats/tale-of-tape">{t('statistics.nav.taleOfTape')}</Link>
          <Link to="/stats/records">{t('statistics.nav.records')}</Link>
          <Link to="/stats/best-matches">{t('statistics.nav.bestMatches')}</Link>
          <Link to="/stats/achievements">{t('statistics.nav.achievements')}</Link>
        </div>
      </div>

      <div className="ps-controls">
        <div className="ps-player-selector">
          <label htmlFor="player-select">{t('statistics.playerStats.selectPlayer')}</label>
          <select
            id="player-select"
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
          >
            {players.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.name} ({p.wrestlerName})
              </option>
            ))}
          </select>
        </div>
        <SeasonSelector
          seasons={seasons}
          selectedSeasonId={selectedSeasonId}
          onSeasonChange={setSelectedSeasonId}
        />
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

export default PlayerStats;
