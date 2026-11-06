import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DashboardMatch } from '../../types';
import { formatMatchType } from '../../utils/matchDisplay';
import { StarRating } from '../matches/StarRating';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import HomeSection from './HomeSection';

const RESULTS_SHOWN = 5;

export default function LatestResults({ results }: { results: DashboardMatch[] }) {
  const { t } = useTranslation();

  return (
    <HomeSection title={t('dashboard.recentResults')} accent="cyan" linkTo="/matches" linkLabel={t('home.allMatches')}>
      {results.length === 0 ? (
        <p className="home-empty">{t('dashboard.noRecentResults')}</p>
      ) : (
        <Card padding="none">
          <ul className="home-list">
            {results.slice(0, RESULTS_SHOWN).map((match) => (
              <li key={match.matchId}>
                <Link to={match.eventId ? `/events/${match.eventId}` : '/matches'} className="home-result">
                  <span className="home-result__outcome">
                    <span className="home-result__winner">{match.winnerName}</span>
                    <span className="home-result__def"> {t('dashboard.def')} </span>
                    <span className="home-result__loser">{match.loserName}</span>
                  </span>
                  <span className="home-result__type">
                    {formatMatchType(match.matchType, t)}
                    {match.stipulation ? ` · ${match.stipulation}` : ''}
                  </span>
                  {(match.isChampionship || match.matchOfTheNight || Boolean(match.ratingsCount)) && (
                    <span className="home-result__extras">
                      {match.isChampionship && match.championshipName && <Badge tone="violet">{match.championshipName}</Badge>}
                      {match.matchOfTheNight && <Badge tone="pink">{t('match.matchOfTheNightBadge')}</Badge>}
                      {Boolean(match.ratingsCount) && (
                        <StarRating starRating={match.starRating} ratingsCount={match.ratingsCount} size="sm" />
                      )}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </HomeSection>
  );
}
