import { useTranslation } from 'react-i18next';
import { groupMatchSides } from '../../utils/matchDisplay';
import Badge from '../ui/Badge';

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
  matchFormat: string;
  /** Set once the result stands. A draw names no winner or loser. */
  winners?: string[];
  losers?: string[];
}

/** Two sides face off around one "vs"; bigger fields are a compact list of names. */
export default function MatchSides({ participants, teams, matchFormat, winners, losers }: MatchSidesProps) {
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
      </span>
    );
  };

  if (sides.length === 2) {
    return (
      <div className="event-match__faceoff">
        {sides.map((side, index) => (
          <div key={side[0]?.playerId ?? index} className="event-match__side">
            {side.map(renderPerson)}
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
          {side.map(renderPerson)}
        </li>
      ))}
    </ul>
  );
}
