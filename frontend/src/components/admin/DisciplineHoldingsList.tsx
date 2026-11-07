import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { DisciplineHoldings } from '../../types';
import { formatMatchDate } from '../../utils/dateUtils';

interface DisciplineHoldingsListProps {
  holdings: DisciplineHoldings;
  /** Close whatever dialog is open, since these links leave the page. */
  onNavigate: () => void;
}

function hasHoldings({ titles, matches, challenges, tournaments }: DisciplineHoldings): boolean {
  return titles.length + matches.length + challenges.length + tournaments.length > 0;
}

/** What a deactivated player still holds, with a way to reach each one. Nothing here changes on its own. */
export default function DisciplineHoldingsList({ holdings, onNavigate }: DisciplineHoldingsListProps) {
  const { t, i18n } = useTranslation();

  if (!hasHoldings(holdings)) {
    return <p className="discipline-modal__muted">{t('discipline.admin.holdingsNone')}</p>;
  }

  return (
    <div className="discipline-holdings">
      <p className="discipline-holdings__title">{t('discipline.admin.holdingsTitle')}</p>
      <p className="discipline-modal__muted">{t('discipline.admin.holdingsNotChanged')}</p>
      <ul className="discipline-holdings__list">
        {holdings.titles.map((title) => (
          <li key={title.championshipId}>
            <Link to="/admin/championships" onClick={onNavigate}>
              {t('discipline.admin.holdingTitle', { name: title.name })}
            </Link>
          </li>
        ))}
        {holdings.matches.map((match) => (
          <li key={match.matchId}>
            <Link
              to={match.eventId ? `/events/${match.eventId}` : `/matches?matchId=${match.matchId}`}
              onClick={onNavigate}
            >
              {t('discipline.admin.holdingMatch', { date: formatMatchDate(match.date, i18n.language) })}
            </Link>
          </li>
        ))}
        {holdings.challenges.map((challenge) => (
          <li key={challenge.challengeId}>
            <Link to="/admin/challenges" onClick={onNavigate}>
              {t('discipline.admin.holdingChallenge', { name: challenge.opponentName })}
            </Link>
          </li>
        ))}
        {holdings.tournaments.map((tournament) => (
          <li key={tournament.tournamentId}>
            <Link to="/tournaments" onClick={onNavigate}>
              {t('discipline.admin.holdingTournament', { name: tournament.name })}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
