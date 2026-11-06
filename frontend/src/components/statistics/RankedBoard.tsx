import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Avatar from '../ui/Avatar';
import Podium from '../ui/Podium';
import './stats-common.css';
import './Leaderboards.css';

export interface RankedEntry {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  rank: number;
  /** The figure the board is ranked on, already formatted. */
  value: string;
  /** Optional second figure, such as a W-L-D record. */
  detail?: string;
}

interface RankedBoardProps {
  entries: RankedEntry[];
  label: string;
}

const PODIUM_SIZE = 3;

/** Top three on a podium when there are enough entries, the rest as a list. */
function RankedBoard({ entries, label }: RankedBoardProps) {
  const { t } = useTranslation();
  const showPodium = entries.length >= PODIUM_SIZE;
  const listed = showPodium ? entries.slice(PODIUM_SIZE) : entries;

  return (
    <>
      {showPodium && (
        <Podium
          label={label}
          entries={entries.slice(0, PODIUM_SIZE).map((entry) => ({
            id: entry.playerId,
            name: entry.playerName,
            subtitle: entry.wrestlerName,
            record: entry.value,
            label: `#${entry.rank}`,
            to: `/stats/player/${entry.playerId}`,
            stats: entry.detail ? [{ label: t('statistics.labels.record'), value: entry.detail }] : undefined,
          }))}
        />
      )}
      {listed.length > 0 && (
        <ol className="stats-rows lb-list" aria-label={label}>
          {listed.map((entry) => (
            <li key={entry.playerId}>
              <span className="lb-rank">#{entry.rank}</span>
              <Avatar name={entry.playerName} size="sm" />
              <div className="stats-row__main">
                <Link to={`/stats/player/${entry.playerId}`} className="stats-row__title lb-player-name">
                  {entry.playerName}
                </Link>
                <span className="stats-row__detail">{entry.wrestlerName}</span>
              </div>
              <div className="lb-figures">
                <span className="lb-value">{entry.value}</span>
                {entry.detail && <span className="lb-record">{entry.detail}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export default RankedBoard;
