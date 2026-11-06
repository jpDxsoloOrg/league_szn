import { useTranslation } from 'react-i18next';
import type { Stable, StableStanding } from '../../types/stable';
import Badge from '../ui/Badge';
import PhotoTile from '../ui/PhotoTile';
import FactionHeat from './FactionHeat';
import { formatRecord, formatWinRate, normalizeStreak } from './factionFormat';
import './FactionCard.css';

interface FactionCardProps {
  faction: Stable;
  leaderName?: string;
  /** Standings row, so the tile shows the same record as the faction's own pages. */
  standing?: StableStanding;
}

export default function FactionCard({ faction, leaderName, standing }: FactionCardProps) {
  const { t } = useTranslation();
  const isActive = faction.status === 'active' || faction.status === 'approved';
  const { wins, losses, draws } = standing ?? faction;

  return (
    <PhotoTile
      className="faction-card"
      to={`/factions/${faction.stableId}`}
      imageUrl={faction.imageUrl}
      title={faction.name}
      eyebrow={leaderName
        ? t('factions.hub.ledBy', 'Led by {{name}}', { name: leaderName })
        : t('factions.hub.leaderMissing', 'Leader no longer listed')}
      badge={!isActive && (
        <Badge tone={faction.status === 'pending' ? 'warning' : 'draw'}>
          {t(`factions.hub.status.${faction.status}`, faction.status)}
        </Badge>
      )}
      meta={(
        <span className="faction-card__meta">
          <span>
            {formatRecord(wins, losses, draws)}
            {' · '}
            {formatWinRate(wins, losses, draws)}
          </span>
          <FactionHeat count={normalizeStreak(standing?.currentStreak)?.count} />
        </span>
      )}
    />
  );
}
