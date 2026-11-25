import { useTranslation } from 'react-i18next';
import type { SideTagTeam } from '../../types';
import type { PublicCurrentInjury } from '../../types/injury';
import { groupMatchSides, sideTagTeamFor } from '../../utils/matchDisplay';
import MatchSideLabel from '../matches/MatchSideLabel';
import Badge from '../ui/Badge';
import InjuryBadge from '../injuries/InjuryBadge';

export interface MatchSideParticipant {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  /** Live PSN gamertag from the player record; undefined when unset. */
  psnId?: string;
}

interface MatchSidesProps {
  participants: MatchSideParticipant[];
  teams?: string[][];
  /** Tag team per side, aligned with `teams`; a team side is billed by its name (TTB-02). */
  sideTagTeams?: (SideTagTeam | null)[];
  matchFormat: string;
  /** Set once the result stands. A draw names no winner or loser. */
  winners?: string[];
  losers?: string[];
  /** INJ-12: injured participants, badged with their return date. Leave out on results. */
  injuries?: ReadonlyMap<string, PublicCurrentInjury>;
}

/** Two sides face off around one "vs"; bigger fields are a compact list of names. */
export default function MatchSides({ participants, teams, sideTagTeams, matchFormat, winners, losers, injuries }: MatchSidesProps) {
  const { t } = useTranslation();
  const sides = groupMatchSides(participants, (participant) => participant.playerId, teams, matchFormat);
  if (sides.length === 0) return null;

  const renderPerson = (participant: MatchSideParticipant) => {
    const isWinner = winners?.includes(participant.playerId) ?? false;
    const isLoser = losers?.includes(participant.playerId) ?? false;
    return (
      <span
        key={participant.playerId}
        className={`event-match__participant${isWinner ? ' is-winner' : ''}${isLoser ? ' is-loser' : ''}`}
      >
        <span className="event-match__wrestler">
          {participant.wrestlerName}
          {isWinner && <Badge tone="win">{t('events.detail.winner')}</Badge>}
        </span>
        <span className="event-match__player">
          {participant.playerName}
          {participant.psnId && ` · ${participant.psnId}`}
        </span>
        <InjuryBadge injury={injuries?.get(participant.playerId)} />
      </span>
    );
  };

  const renderSide = (side: MatchSideParticipant[], align: 'start' | 'end' = 'start') => {
    const team = sideTagTeamFor(side.map((participant) => participant.playerId), teams, sideTagTeams);
    const sideWon = side.some((participant) => winners?.includes(participant.playerId));
    return (
      <MatchSideLabel team={team} align={align} teamClassName={sideWon ? 'event-match__team is-winner' : 'event-match__team'}>
        {side.map(renderPerson)}
      </MatchSideLabel>
    );
  };

  if (sides.length === 2) {
    return (
      <div className="event-match__faceoff">
        {sides.map((side, index) => (
          <div key={side[0]?.playerId ?? index} className="event-match__side">
            {renderSide(side, index === 1 ? 'end' : 'start')}
          </div>
        ))}
        <span className="event-match__vs">{t('common.vs')}</span>
      </div>
    );
  }

  return (
    <ul className="event-match__field">
      {sides.map((side, index) => (
        <li key={side[0]?.playerId ?? index} className="event-match__side">
          {renderSide(side)}
        </li>
      ))}
    </ul>
  );
}
