import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StatsPlayer } from '../../services/api';
import type { PlayerStatistics as PlayerStatisticsType, ChampionshipStats, Achievement } from '../../types/statistics';
import { formatCalendarDate } from '../../utils/dateUtils';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import DataTable from '../ui/DataTable';
import './stats-common.css';
import './PlayerStats.css';

interface PlayerStatsContentProps {
  player: StatsPlayer;
  imageUrl?: string;
  overallStats: PlayerStatisticsType;
  matchTypeStats: PlayerStatisticsType[];
  championshipStats: (ChampionshipStats & { championshipName?: string })[];
  achievements: Achievement[];
}

function PlayerStatsContent({
  player,
  imageUrl,
  overallStats,
  matchTypeStats,
  championshipStats,
  achievements,
}: PlayerStatsContentProps) {
  const { t } = useTranslation();

  const matchTypeLabels: Record<string, string> = {
    singles: t('statistics.matchTypes.singles'),
    tag: t('statistics.matchTypes.tag'),
    ladder: t('statistics.matchTypes.ladder'),
    cage: t('statistics.matchTypes.cage'),
  };
  const matchTypeLabel = (stat: PlayerStatisticsType) => matchTypeLabels[stat.statType] ?? stat.statType;
  const playedMatchTypes = matchTypeStats.filter((stat) => stat.matchesPlayed > 0);

  const streaks = [
    { key: 'current', label: t('statistics.labels.currentWinStreak'), value: overallStats.currentWinStreak },
    { key: 'best', label: t('statistics.labels.longestWinStreak'), value: overallStats.longestWinStreak },
    { key: 'worst', label: t('statistics.labels.longestLossStreak'), value: overallStats.longestLossStreak },
    { key: 'titles', label: t('statistics.labels.titleWins'), value: overallStats.championshipWins },
  ];

  return (
    <>
      <section className="ps-record-card">
        <Avatar src={imageUrl} name={player.name} size="xl" ring="pink" />
        <div className="ps-identity">
          <h2 className="ps-name">{player.name}</h2>
          <p className="ps-wrestler">{player.wrestlerName}</p>
          {overallStats.firstMatchDate && (
            <p className="ps-date-range">
              {t('statistics.labels.active')}: {formatCalendarDate(overallStats.firstMatchDate)}
              {' - '}
              {overallStats.lastMatchDate ? formatCalendarDate(overallStats.lastMatchDate) : t('statistics.labels.present')}
            </p>
          )}
        </div>
        <div className="ps-record">
          <dl className="ps-wld">
            <div className="ps-wld-item ps-wins">
              <dt className="ps-wld-label">{t('statistics.labels.wins')}</dt>
              <dd className="ps-wld-number">{overallStats.wins}</dd>
            </div>
            <div className="ps-wld-item ps-losses">
              <dt className="ps-wld-label">{t('statistics.labels.losses')}</dt>
              <dd className="ps-wld-number">{overallStats.losses}</dd>
            </div>
            <div className="ps-wld-item">
              <dt className="ps-wld-label">{t('statistics.labels.draws')}</dt>
              <dd className="ps-wld-number">{overallStats.draws}</dd>
            </div>
          </dl>
          <p className="ps-record-summary">
            <span className="ps-win-pct-value">
              {overallStats.matchesPlayed > 0 ? `${overallStats.winPercentage.toFixed(1)}%` : '-'}
            </span>
            {' '}{t('statistics.labels.winPercentage')}
            <span className="ps-matches-played">{overallStats.matchesPlayed} {t('statistics.labels.matchesPlayed')}</span>
          </p>
        </div>
      </section>

      <section className="stats-section">
        <h2 className="stats-section__title">{t('statistics.playerStats.streaks')}</h2>
        <dl className="ps-streak-grid">
          {streaks.map((streak) => (
            <div key={streak.key} className="ps-streak-item">
              <dt className="ps-streak-label">{streak.label}</dt>
              <dd className="ps-streak-value">{streak.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {playedMatchTypes.length > 0 && (
        <section className="stats-section">
          <h2 className="stats-section__title">{t('statistics.playerStats.matchTypeBreakdown')}</h2>
          <DataTable
            caption={t('statistics.playerStats.winRateByMatchType')}
            rows={playedMatchTypes}
            rowKey={(stat) => stat.statType}
            columns={[
              { key: 'type', header: t('statistics.labels.matchType'), render: matchTypeLabel },
              {
                key: 'record',
                header: t('statistics.labels.record'),
                align: 'center',
                render: (stat) => `${stat.wins} - ${stat.losses} - ${stat.draws}`,
              },
              {
                key: 'winRate',
                header: t('statistics.labels.winPercentage'),
                render: (stat) => (
                  <span className="ps-win-rate">
                    <progress className="stats-bar" value={stat.winPercentage} max={100} aria-hidden="true" />
                    {stat.winPercentage.toFixed(0)}%
                  </span>
                ),
                sortValue: (stat) => stat.winPercentage,
              },
              {
                key: 'matches',
                header: t('statistics.labels.matchesPlayed'),
                align: 'end',
                render: (stat) => stat.matchesPlayed,
                hideOnMobile: true,
              },
              {
                key: 'bestStreak',
                header: t('statistics.labels.bestStreak'),
                align: 'end',
                render: (stat) => stat.longestWinStreak,
              },
            ]}
          />
        </section>
      )}

      {championshipStats.length > 0 && (
        <section className="stats-section">
          <h2 className="stats-section__title">{t('statistics.playerStats.championshipHistory')}</h2>
          <ul className="stats-rows">
            {championshipStats.map((championship) => (
              <li key={championship.championshipId}>
                <div className="stats-row__main">
                  <span className="stats-row__title">{championship.championshipName ?? championship.championshipId}</span>
                  <span className="stats-row__detail ps-champ-details">
                    <span>{t('statistics.labels.reignCount', { count: championship.totalReigns })}</span>
                    <span>{championship.totalDaysHeld} {t('statistics.labels.daysHeld')}</span>
                    <span>{championship.totalDefenses} {t('statistics.labels.defenses')}</span>
                    <span>{t('statistics.labels.longestReign')}: {championship.longestReign} {t('common.days')}</span>
                  </span>
                </div>
                {championship.currentlyHolding && <Badge tone="warning">{t('statistics.labels.currentChampion')}</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {achievements.length > 0 && (
        <section className="stats-section">
          <h2 className="stats-section__title">{t('statistics.playerStats.recentAchievements')}</h2>
          <ul className="stats-rows">
            {achievements.slice(0, 5).map((achievement) => (
              <li key={achievement.achievementId}>
                <span className="ps-achievement-icon" aria-hidden="true">{achievement.icon}</span>
                <div className="stats-row__main">
                  <span className="stats-row__title">{achievement.achievementName}</span>
                  <span className="stats-row__detail">{achievement.description}</span>
                </div>
              </li>
            ))}
          </ul>
          <Link to={`/stats/achievements?player=${player.playerId}`} className="ps-view-all-link">
            {t('statistics.playerStats.viewAllAchievements')}
          </Link>
        </section>
      )}
    </>
  );
}

export default PlayerStatsContent;
