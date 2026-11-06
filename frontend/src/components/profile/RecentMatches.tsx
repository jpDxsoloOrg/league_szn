import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Match } from '../../types';
import { formatMatchDate } from '../../utils/dateUtils';
import { describeSides, formatMatchType, getMatchResult, groupMatchSides } from '../../utils/matchDisplay';
import type { FormResult } from '../../utils/matchDisplay';
import Badge from '../ui/Badge';
import Card from '../ui/Card';

const MATCHES_SHOWN = 5;
const RESULT_TONES = { W: 'win', L: 'loss', D: 'draw' } as const;

interface RecentMatchesProps {
  playerId: string;
  matches: Match[];
  /** Wrestler names by playerId. */
  names: Map<string, string>;
}

interface MatchRow {
  match: Match;
  result: FormResult | null;
  opponents: string;
}

/** A player's latest completed matches. Hidden until they have one. */
export default function RecentMatches({ playerId, matches, names }: RecentMatchesProps) {
  const { t } = useTranslation();
  const nameOf = (id: string) => names.get(id) ?? t('common.unknown');

  const rows = matches
    .filter((match) => match.status === 'completed')
    .sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime())
    .slice(0, MATCHES_SHOWN)
    .map((match): MatchRow => {
      const sides = groupMatchSides(match.participants, (id) => id, match.teams, match.matchFormat);
      const opposition = sides.filter((side) => !side.includes(playerId)).map((side) => side.map(nameOf));
      return { match, result: getMatchResult(match, playerId), opponents: describeSides(opposition, t('common.vs')) };
    });

  if (rows.length === 0) return null;

  return (
    <section className="profile-section" aria-labelledby="profile-matches-title">
      <h2 className="profile-section__title" id="profile-matches-title">{t('publicProfile.recentMatches')}</h2>
      <Card padding="none">
        <ul className="profile-rows">
          {rows.map(({ match, result, opponents }) => (
            <li key={match.matchId}>
              <Link to={`/matches?matchId=${match.matchId}`} className="profile-row profile-row--link">
                {result && <Badge tone={RESULT_TONES[result]}>{result}</Badge>}
                <span className="profile-row__main profile-row__main--stacked">
                  <span>{opponents ? `${t('common.vs')} ${opponents}` : formatMatchType(match.matchFormat, t)}</span>
                  <span className="profile-row__meta">
                    {[opponents ? formatMatchType(match.matchFormat, t) : '', formatMatchDate(match.date)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {match.isChampionship && <Badge tone="warning">{t('publicProfile.titleMatch')}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
