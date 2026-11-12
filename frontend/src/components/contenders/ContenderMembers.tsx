import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { Division, Player } from '../../types';
import type { ContenderMember } from '../../types/contender';
import PlayerHoverCard from '../PlayerHoverCard';
import Avatar from '../ui/Avatar';
import './ContenderMembers.css';

/** Player rows and divisions used to show a member's hover card. */
export interface MemberLookup {
  playersById: ReadonlyMap<string, Player>;
  divisions: Division[];
}

interface MemberNamesProps {
  members: ContenderMember[];
  lookup?: MemberLookup;
}

/** "Player A & Player B". Known players link to their profile and open the hover card. */
export function MemberNames({ members, lookup }: MemberNamesProps) {
  return (
    <>
      {members.map((member, index) => {
        const player = lookup?.playersById.get(member.playerId);
        return (
          <Fragment key={member.playerId}>
            {index > 0 && <span className="contender-members__joiner"> &amp; </span>}
            {player && lookup ? (
              <PlayerHoverCard player={player} divisions={lookup.divisions}>
                <Link to={`/player/${member.playerId}`} className="contender-members__link">
                  {member.playerName}
                </Link>
              </PlayerHoverCard>
            ) : (
              <span>{member.playerName}</span>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

interface MemberAvatarsProps {
  members: ContenderMember[];
  size: 'md' | 'lg';
  ring?: 'none' | 'pink' | 'gold';
}

/** Overlapping portraits of the team members. Stacked diagonally on phones. */
export function MemberAvatars({ members, size, ring = 'none' }: MemberAvatarsProps) {
  return (
    <span className={`contender-duo contender-duo--${size}`}>
      {members.map((member) => (
        <Avatar
          key={member.playerId}
          className="contender-duo__avatar"
          src={member.imageUrl}
          name={member.wrestlerName}
          size={size}
          ring={ring}
        />
      ))}
    </span>
  );
}
