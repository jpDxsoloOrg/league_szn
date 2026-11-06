import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import './Podium.css';

export interface PodiumStat {
  label: string;
  value: ReactNode;
}

export interface PodiumEntry {
  id: string;
  name: string;
  imageUrl?: string | null;
  /** Record line, such as "12 - 3 - 1". */
  record: string;
  subtitle?: string;
  /** Pill above the card. Defaults to the rank number. */
  label?: string;
  /** Hidden on phones to keep the podium compact. */
  stats?: PodiumStat[];
  to?: string;
}

export interface PodiumProps {
  /** Ranked best first. The first three are shown, in 2-1-3 order. */
  entries: PodiumEntry[];
  /** Names the list for screen readers. */
  label: string;
  className?: string;
}

const RANK_CLASSES = ['first', 'second', 'third'] as const;
const AVATAR_RINGS = ['gold', 'cyan', 'violet'] as const;

function PodiumCard({ entry, rank }: { entry: PodiumEntry; rank: number }) {
  const rankClass = RANK_CLASSES[rank - 1] ?? 'third';
  const ring = AVATAR_RINGS[rank - 1] ?? 'violet';
  const body = (
    <>
      <span className="ui-podium__rank">{entry.label ?? `#${rank}`}</span>
      <Avatar src={entry.imageUrl} name={entry.name} size={rank === 1 ? 'xl' : 'lg'} ring={ring} />
      <span className="ui-podium__name">{entry.name}</span>
      {entry.subtitle && <span className="ui-podium__subtitle">{entry.subtitle}</span>}
      <span className="ui-podium__record">{entry.record}</span>
      {entry.stats && entry.stats.length > 0 && (
        <dl className="ui-podium__stats">
          {entry.stats.map((stat) => (
            <div key={stat.label} className="ui-podium__stat">
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );

  return (
    <li className={`ui-podium__slot ui-podium__slot--${rankClass}`} value={rank}>
      {entry.to ? <Link to={entry.to} className="ui-podium__card">{body}</Link> : <div className="ui-podium__card">{body}</div>}
    </li>
  );
}

/** Top-three display. List order stays 1-2-3; CSS places first in the middle. */
export default function Podium({ entries, label, className = '' }: PodiumProps) {
  return (
    <ol className={`ui-podium ${className}`.trim()} aria-label={label}>
      {entries.slice(0, 3).map((entry, index) => (
        <PodiumCard key={entry.id} entry={entry} rank={index + 1} />
      ))}
    </ol>
  );
}
