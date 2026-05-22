import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Player } from '../../types';
import type { Rivalry, RivalryStatus } from '../../types/rivalry';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import { resolveWrestlerName } from './rivalryUtils';
import HeatBadge from './HeatBadge';
import './RivalryCard.css';

interface RivalryCardProps {
  rivalry: Rivalry;
  participants: Player[];
  matchCount: number;
  lastActivityAt?: string;
}

const STATUS_LABEL_KEY: Record<RivalryStatus, string> = {
  pending: 'rivalries.status.pending',
  active: 'rivalries.status.active',
  completed: 'rivalries.status.completed',
  rejected: 'rivalries.status.rejected',
  cancelled: 'rivalries.status.cancelled',
};

export default function RivalryCard({
  rivalry,
  participants,
  matchCount,
  lastActivityAt,
}: RivalryCardProps) {
  const { t } = useTranslation();

  const lookup = new Map(participants.map((p) => [p.playerId, p] as const));
  const partA = rivalry.participants[0];
  const partB = rivalry.participants[1];
  const a = partA ? lookup.get(partA.playerId) : undefined;
  const b = partB ? lookup.get(partB.playerId) : undefined;
  const nameA = resolveWrestlerName(partA, a);
  const nameB = resolveWrestlerName(partB, b);

  const lastActivityLabel = lastActivityAt
    ? new Date(lastActivityAt).toLocaleDateString()
    : t('rivalries.card.noActivity');

  return (
    <Link to={`/rivalries/${rivalry.rivalryId}`} className="rivalry-card">
      <div className="rivalry-card__faceoff">
        <div className="rivalry-card__avatar">
          <img
            src={resolveImageSrc(a?.imageUrl, DEFAULT_WRESTLER_IMAGE)}
            alt={nameA}
            onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
          />
          <span className="rivalry-card__avatar-name">{nameA}</span>
        </div>

        <span className="rivalry-card__vs" aria-hidden="true">vs</span>

        <div className="rivalry-card__avatar">
          <img
            src={resolveImageSrc(b?.imageUrl, DEFAULT_WRESTLER_IMAGE)}
            alt={nameB}
            onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
          />
          <span className="rivalry-card__avatar-name">{nameB}</span>
        </div>
      </div>

      <h3 className="rivalry-card__title">{rivalry.title}</h3>

      <div className="rivalry-card__meta">
        <span
          className={`rivalry-card__status rivalry-card__status--${rivalry.status}`}
        >
          {t(STATUS_LABEL_KEY[rivalry.status])}
        </span>
        <HeatBadge heat={rivalry.heat} heatScore={rivalry.heatScore} size="sm" />
      </div>

      <div className="rivalry-card__footer">
        <span>{t('rivalries.card.matchCount', { count: matchCount })}</span>
        <span>{lastActivityLabel}</span>
      </div>
    </Link>
  );
}
