import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { DashboardQuickStats, DashboardSeason } from '../../types';
import { formatCalendarDate } from '../../utils/dateUtils';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import HomeSection from './HomeSection';

/** Percent of the season elapsed, or null when it has no end date to measure against. */
function getSeasonProgress(season: DashboardSeason): number | null {
  if (!season.startDate || !season.endDate) return null;
  const start = new Date(season.startDate).getTime();
  const end = new Date(season.endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.round(Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)));
}

export interface SeasonSummaryProps {
  season: DashboardSeason | null;
  stats: DashboardQuickStats;
}

export default function SeasonSummary({ season, stats }: SeasonSummaryProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const progress = season ? getSeasonProgress(season) : null;

  return (
    <HomeSection title={t('dashboard.seasonProgress')} accent="cyan">
      <Card className="home-season">
        {season ? (
          <div className="home-season__current">
            <p className="home-season__name">{season.name}</p>
            {season.startDate && (
              <p className="home-season__start">
                {t('dashboard.seasonStart')}: {formatCalendarDate(season.startDate)}
              </p>
            )}
            {progress !== null && (
              <div className="home-season__progress">
                <progress className="home-season__bar" value={progress} max={100} aria-label={t('dashboard.seasonProgress')} />
                <span className="home-season__percent">{progress}%</span>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            className="home-season__empty"
            title={t('dashboard.noActiveSeason')}
            actionLabel={t('dashboard.emptyActions.seeGuide', 'See getting started')}
            onAction={() => navigate('/guide/wiki/getting-started')}
          />
        )}
        <div className="home-season__stats">
          <h3 className="home-season__stats-title">{t('dashboard.quickStats')}</h3>
          <dl className="home-stats">
            <div className="home-stats__item">
              <dd className="home-stats__value">{stats.totalPlayers}</dd>
              <dt className="home-stats__label">{t('home.stats.players')}</dt>
            </div>
            {season?.matchesPlayed !== undefined && (
              <div className="home-stats__item">
                <dd className="home-stats__value">{season.matchesPlayed}</dd>
                <dt className="home-stats__label">{t('home.stats.seasonMatches')}</dt>
              </div>
            )}
            <div className="home-stats__item">
              <dd className="home-stats__value">{stats.totalMatches}</dd>
              <dt className="home-stats__label">{t('home.stats.allTimeMatches')}</dt>
            </div>
            <div className="home-stats__item">
              <dd className="home-stats__value">{stats.activeChampionships}</dd>
              <dt className="home-stats__label">{t('home.stats.titles')}</dt>
            </div>
            {stats.mostWinsPlayer && (
              <div className="home-stats__item">
                <dd className="home-stats__value">{stats.mostWinsPlayer.wins}</dd>
                <dt className="home-stats__label">{t('dashboard.mostWins')}: {stats.mostWinsPlayer.name}</dt>
              </div>
            )}
          </dl>
        </div>
      </Card>
    </HomeSection>
  );
}
