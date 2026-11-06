import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Rivalry } from '../../types/rivalry';
import { missingPlayerLabel } from '../../utils/playerName';
import Card from '../ui/Card';
import HeatBadge from '../rivalries/HeatBadge';

const RIVALRIES_SHOWN = 3;

interface ProfileRivalriesProps {
  playerId: string;
  rivalries: Rivalry[];
  /** Wrestler names by playerId. */
  names: Map<string, string>;
}

/** The feuds a player is in right now. */
export default function ProfileRivalries({ playerId, rivalries, names }: ProfileRivalriesProps) {
  const { t } = useTranslation();
  if (rivalries.length === 0) return null;

  return (
    <section className="profile-section" aria-labelledby="profile-rivalries-title">
      <h2 className="profile-section__title" id="profile-rivalries-title">{t('publicProfile.rivalries')}</h2>
      <Card padding="none">
        <ul className="profile-rows">
          {rivalries.slice(0, RIVALRIES_SHOWN).map((rivalry) => {
            const opponents = rivalry.participants
              .filter((participant) => participant.playerId !== playerId)
              .map((participant) => names.get(participant.playerId) ?? missingPlayerLabel(names, t));
            return (
              <li key={rivalry.rivalryId}>
                <Link to={`/rivalries/${rivalry.rivalryId}`} className="profile-row profile-row--link">
                  <span className="profile-row__main profile-row__main--stacked">
                    <span>{rivalry.title}</span>
                    <span className="profile-row__meta">{t('common.vs')} {opponents.join(', ')}</span>
                  </span>
                  <HeatBadge heat={rivalry.heat} heatScore={rivalry.heatScore} size="sm" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
