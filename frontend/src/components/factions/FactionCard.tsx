import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Stable } from '../../types/stable';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import './FactionCard.css';

interface FactionCardProps {
  faction: Stable;
}

export default function FactionCard({ faction }: FactionCardProps) {
  const { t } = useTranslation();
  const totalMatches = faction.wins + faction.losses + faction.draws;
  const winPercentage = totalMatches > 0
    ? ((faction.wins / totalMatches) * 100).toFixed(1)
    : '0.0';

  return (
    <Link to={`/stables/${faction.stableId}`} className="faction-card">
      <div className="faction-card__image-wrapper">
        <img
          src={resolveImageSrc(faction.imageUrl, DEFAULT_WRESTLER_IMAGE)}
          onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
          alt={faction.name}
          className="faction-card__image"
        />
      </div>
      <div className="faction-card__body">
        <h3 className="faction-card__name">{faction.name}</h3>
        <span className="faction-card__members">
          {t('stables.memberCount', '{{count}} members', { count: faction.memberIds.length })}
        </span>
        <div className="faction-card__stats">
          <span className="faction-card__stat faction-card__stat--wins">
            {faction.wins}{t('stables.wAbbrev', 'W')}
          </span>
          <span className="faction-card__stat faction-card__stat--losses">
            {faction.losses}{t('stables.lAbbrev', 'L')}
          </span>
          <span className="faction-card__stat faction-card__stat--draws">
            {faction.draws}{t('stables.dAbbrev', 'D')}
          </span>
          <span className="faction-card__stat faction-card__stat--winpct">
            {winPercentage}%
          </span>
        </div>
      </div>
    </Link>
  );
}
