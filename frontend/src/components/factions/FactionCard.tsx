import { useTranslation } from 'react-i18next';
import type { Stable } from '../../types/stable';
import Badge from '../ui/Badge';
import PhotoTile from '../ui/PhotoTile';
import FactionHeat from './FactionHeat';
import { formatRecord, formatWinRate } from './factionFormat';
import './FactionCard.css';

interface FactionCardProps {
  faction: Stable;
  leaderName?: string;
  /** Streak from the standings call. The gauge stays unlit until it arrives. */
  currentStreak?: { type: 'W' | 'L' | 'D'; count: number };
}

export default function FactionCard({ faction, leaderName, currentStreak }: FactionCardProps) {
  const { t } = useTranslation();
  const isActive = faction.status === 'active' || faction.status === 'approved';

  return (
    <PhotoTile
      className="faction-card"
      to={`/factions/${faction.stableId}`}
      imageUrl={faction.imageUrl}
      title={faction.name}
      eyebrow={t('factions.hub.ledBy', 'Led by {{name}}', {
        name: leaderName ?? t('factions.unknownLeader', 'Unknown'),
      })}
      badge={!isActive && (
        <Badge tone={faction.status === 'pending' ? 'warning' : 'draw'}>
          {t(`factions.hub.status.${faction.status}`, faction.status)}
        </Badge>
      )}
      meta={(
        <span className="faction-card__meta">
          <span>
            {formatRecord(faction.wins, faction.losses, faction.draws)}
            {' · '}
            {formatWinRate(faction.wins, faction.losses, faction.draws)}
          </span>
          <FactionHeat count={currentStreak?.count} />
        </span>
      )}
    />
  );
}
