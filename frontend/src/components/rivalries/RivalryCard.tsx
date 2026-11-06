import { useTranslation } from 'react-i18next';
import type { Player } from '../../types';
import type { Rivalry } from '../../types/rivalry';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import { RIVALRY_STATUS_KEY, resolvePlayerCaption, resolveWrestlerName } from './rivalryUtils';
import HeatBadge from './HeatBadge';
import './RivalryCard.css';

interface RivalryCardProps {
  rivalry: Rivalry;
  participants: Player[];
  lastActivityAt?: string;
}

export default function RivalryCard({ rivalry, participants, lastActivityAt }: RivalryCardProps) {
  const { t } = useTranslation();
  const lookup = new Map(participants.map((p) => [p.playerId, p] as const));
  const sides = rivalry.participants.slice(0, 2).map((participant) => {
    const player = lookup.get(participant.playerId);
    return {
      playerId: participant.playerId,
      name: resolveWrestlerName(participant, player),
      caption: resolvePlayerCaption(player),
      imageUrl: player?.imageUrl,
    };
  });

  return (
    <Card to={`/rivalries/${rivalry.rivalryId}`} className="rivalry-card">
      <h3 className="rivalry-card__title">{rivalry.title}</h3>

      <div className="rivalry-card__faceoff">
        {sides.map((side) => (
          <div key={side.playerId} className="rivalry-card__side">
            <Avatar src={side.imageUrl} name={side.name} size="lg" />
            <span className="rivalry-card__name">{side.name}</span>
            {side.caption && <span className="rivalry-card__caption">{side.caption}</span>}
          </div>
        ))}
        <span className="rivalry-card__vs" aria-hidden="true">{t('common.vs')}</span>
      </div>

      <div className="rivalry-card__footer">
        <HeatBadge heat={rivalry.heat} heatScore={rivalry.heatScore} size="sm" />
        {rivalry.status !== 'active' && <Badge>{t(RIVALRY_STATUS_KEY[rivalry.status])}</Badge>}
        <span className="rivalry-card__date">
          {lastActivityAt ? new Date(lastActivityAt).toLocaleDateString() : t('rivalries.card.noActivity')}
        </span>
      </div>
    </Card>
  );
}
