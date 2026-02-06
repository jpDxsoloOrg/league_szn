import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  mockPlayers,
  mockPlayerStatistics,
  getPlayerStats,
  getChampionshipStats,
  getPlayerAchievements,
} from '../../mocks/statisticsMockData';
import type { PlayerStatistics as PlayerStatisticsType } from '../../types/statistics';
import './PlayerStats.css';

function PlayerStats() {
  const { t } = useTranslation();
  const { playerId: routePlayerId } = useParams<{ playerId: string }>();
  const [selectedPlayerId, setSelectedPlayerId] = useState(routePlayerId || 'p1');

  const player = useMemo(
    () => mockPlayers.find((p) => p.playerId === selectedPlayerId),
    [selectedPlayerId]
  );

  const overallStats = useMemo(
    () => getPlayerStats(selectedPlayerId, 'overall')[0],
    [selectedPlayerId]
  );

  const matchTypeStats = useMemo(
    () =>
      getPlayerStats(selectedPlayerId).filter((s) => s.statType !== 'overall'),
    [selectedPlayerId]
  );

  const championshipStats = useMemo(
    () => getChampionshipStats(selectedPlayerId),
    [selectedPlayerId]
  );

  const achievements = useMemo(
    () => getPlayerAchievements(selectedPlayerId),
    [selectedPlayerId]
  );

  const maxWinsAcrossTypes = useMemo(() => {
    const allTypeStats = mockPlayerStatistics.filter(
      (s) => s.statType !== 'overall'
    );
    return Math.max(...allTypeStats.map((s) => s.wins), 1);
  }, []);

  const matchTypeLabels: Record<string, string> = {
    singles: t('statistics.matchTypes.singles'),
    tag: t('statistics.matchTypes.tag'),
    ladder: t('statistics.matchTypes.ladder'),
    cage: t('statistics.matchTypes.cage'),
  };

  const championshipNames: Record<string, string> = {
    c1: t('statistics.championshipNames.world'),
    c2: t('statistics.championshipNames.intercontinental'),
    c3: t('statistics.championshipNames.tag'),
  };

  function renderBarChart(stat: PlayerStatisticsType) {
    const barWidth = (stat.wins / maxWinsAcrossTypes) * 100;
    return (
      <div className="ps-bar-row" key={stat.statType}>
        <span className="ps-bar-label">
          {matchTypeLabels[stat.statType] || stat.statType}
        </span>
        <div className="ps-bar-track">
          <div
            className="ps-bar-fill"
            style={{ width: `${barWidth}%` }}
          >
            <span className="ps-bar-value">{stat.wins}W</span>
          </div>
        </div>
        <span className="ps-bar-record">
          {stat.wins}-{stat.losses}-{stat.draws}
        </span>
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
          <Link to="/stats/tale-of-tape">{t('statistics.nav.taleOfTape')}</Link>
          <Link to="/stats/records">{t('statistics.nav.records')}</Link>
          <Link to="/stats/achievements">{t('statistics.nav.achievements')}</Link>
        </div>
      </div>

      <div className="ps-player-selector">
        <label htmlFor="player-select">{t('statistics.playerStats.selectPlayer')}</label>
        <select
          id="player-select"
          value={selectedPlayerId}
          onChange={(e) => setSelectedPlayerId(e.target.value)}
        >
          {mockPlayers.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name} ({p.wrestlerName})
            </option>
          ))}
        </select>
      </div>

      <div className="ps-grid">
        {/* W-L-D Record Card */}
        <div className="ps-card ps-record-card">
          <h3>{player.name} ({player.wrestlerName})</h3>
          <div className="ps-wld">
            <div className="ps-wld-item ps-wins">
              <span className="ps-wld-number">{overallStats.wins}</span>
              <span className="ps-wld-label">{t('statistics.labels.wins')}</span>
            </div>
            <div className="ps-wld-divider">-</div>
            <div className="ps-wld-item ps-losses">
              <span className="ps-wld-number">{overallStats.losses}</span>
              <span className="ps-wld-label">{t('statistics.labels.losses')}</span>
            </div>
            <div className="ps-wld-divider">-</div>
            <div className="ps-wld-item ps-draws">
              <span className="ps-wld-number">{overallStats.draws}</span>
              <span className="ps-wld-label">{t('statistics.labels.draws')}</span>
            </div>
          </div>
          <div className="ps-win-pct">
            <span className="ps-win-pct-value">{overallStats.winPercentage.toFixed(1)}%</span>
            <span className="ps-win-pct-label">{t('statistics.labels.winPercentage')}</span>
          </div>
          <div className="ps-matches-played">
            {overallStats.matchesPlayed} {t('statistics.labels.matchesPlayed')}
          </div>
        </div>

        {/* Streak Stats */}
        <div className="ps-card ps-streak-card">
          <h3>{t('statistics.playerStats.streaks')}</h3>
          <div className="ps-streak-grid">
            <div className="ps-streak-item">
              <span className="ps-streak-value" data-positive={overallStats.currentWinStreak > 0}>
                {overallStats.currentWinStreak}
              </span>
              <span className="ps-streak-label">{t('statistics.labels.currentStreak')}</span>
            </div>
            <div className="ps-streak-item">
              <span className="ps-streak-value">{overallStats.longestWinStreak}</span>
              <span className="ps-streak-label">{t('statistics.labels.longestWinStreak')}</span>
            </div>
            <div className="ps-streak-item">
              <span className="ps-streak-value ps-loss-streak">{overallStats.longestLossStreak}</span>
              <span className="ps-streak-label">{t('statistics.labels.longestLossStreak')}</span>
            </div>
            <div className="ps-streak-item">
              <span className="ps-streak-value">{overallStats.championshipWins}</span>
              <span className="ps-streak-label">{t('statistics.labels.titleWins')}</span>
            </div>
          </div>
          {overallStats.firstMatchDate && (
            <div className="ps-date-range">
              {t('statistics.labels.active')}: {overallStats.firstMatchDate} - {overallStats.lastMatchDate || t('statistics.labels.present')}
            </div>
          )}
        </div>
      </div>

      {/* Match Type Breakdown */}
      <div className="ps-card ps-breakdown-card">
        <h3>{t('statistics.playerStats.matchTypeBreakdown')}</h3>
        <div className="ps-bar-chart">
          {matchTypeStats.map((stat) => renderBarChart(stat))}
        </div>
        <table className="ps-breakdown-table">
          <thead>
            <tr>
              <th>{t('statistics.labels.matchType')}</th>
              <th>{t('statistics.labels.wins')}</th>
              <th>{t('statistics.labels.losses')}</th>
              <th>{t('statistics.labels.draws')}</th>
              <th>{t('statistics.labels.winPercentage')}</th>
              <th>{t('statistics.labels.bestStreak')}</th>
            </tr>
          </thead>
          <tbody>
            {matchTypeStats.map((stat) => (
              <tr key={stat.statType}>
                <td>{matchTypeLabels[stat.statType] || stat.statType}</td>
                <td className="ps-td-wins">{stat.wins}</td>
                <td className="ps-td-losses">{stat.losses}</td>
                <td>{stat.draws}</td>
                <td>{stat.winPercentage.toFixed(1)}%</td>
                <td>{stat.longestWinStreak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Championship History */}
      {championshipStats.length > 0 && (
        <div className="ps-card ps-championship-card">
          <h3>{t('statistics.playerStats.championshipHistory')}</h3>
          <div className="ps-champ-list">
            {championshipStats.map((cs) => (
              <div key={cs.championshipId} className="ps-champ-item">
                <div className="ps-champ-name">
                  {championshipNames[cs.championshipId] || cs.championshipId}
                  {cs.currentlyHolding && (
                    <span className="ps-champ-current">{t('statistics.labels.currentChampion')}</span>
                  )}
                </div>
                <div className="ps-champ-details">
                  <span>{cs.totalReigns} {t('statistics.labels.reigns')}</span>
                  <span>{cs.totalDaysHeld} {t('statistics.labels.daysHeld')}</span>
                  <span>{cs.totalDefenses} {t('statistics.labels.defenses')}</span>
                  <span>{t('statistics.labels.longestReign')}: {cs.longestReign} {t('common.days')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Achievements */}
      {achievements.length > 0 && (
        <div className="ps-card ps-achievements-card">
          <h3>{t('statistics.playerStats.recentAchievements')}</h3>
          <div className="ps-achievement-list">
            {achievements.slice(0, 5).map((ach) => (
              <div key={ach.achievementId} className="ps-achievement-item">
                <span className="ps-achievement-icon">{ach.icon}</span>
                <div className="ps-achievement-info">
                  <span className="ps-achievement-name">{ach.achievementName}</span>
                  <span className="ps-achievement-desc">{ach.description}</span>
                </div>
                <span className="ps-achievement-date">{ach.earnedAt}</span>
              </div>
            ))}
          </div>
          <Link to="/stats/achievements" className="ps-view-all-link">
            {t('statistics.playerStats.viewAllAchievements')}
          </Link>
        </div>
      )}
    </div>
  );
}

export default PlayerStats;
