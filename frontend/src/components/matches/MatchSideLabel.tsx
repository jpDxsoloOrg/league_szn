import type { ReactNode } from 'react';
import type { SideTagTeam } from '../../types';
import './MatchSideLabel.css';

interface MatchSideLabelProps {
  /** The tag team this side was billed as; null or missing renders the members alone. */
  team?: SideTagTeam | null;
  /** The side's members, rendered however the card already shows them. */
  children: ReactNode;
  /** Extra class for the team name, e.g. a winner colour. */
  teamClassName?: string;
  /** Line the team header up with right-aligned members. */
  align?: 'start' | 'end';
}

/** A side billed as its tag team: the team name (and image) over its members (TTB-02). */
export default function MatchSideLabel({ team, children, teamClassName = '', align = 'start' }: MatchSideLabelProps) {
  if (!team) return <>{children}</>;
  return (
    <span className={`match-side-label match-side-label--${align}`}>
      <span className="match-side-label__team">
        {team.imageUrl && <img className="match-side-label__image" src={team.imageUrl} alt="" loading="lazy" />}
        <span className={`match-side-label__name ${teamClassName}`.trim()}>{team.name}</span>
      </span>
      <span className="match-side-label__members">{children}</span>
    </span>
  );
}
