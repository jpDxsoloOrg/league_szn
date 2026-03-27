import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Stable } from '../../types/stable';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import './StableCard.css';

interface StableCardProps {
  stable: Stable;
}

export default function StableCard({ stable }: StableCardProps) {
  const { t } = useTranslation();
  const totalMatches = stable.wins + stable.losses + stable.draws;
  const winPercentage = totalMatches > 0
    ? ((stable.wins / totalMatches) * 100).toFixed(1)
    : '0.0';

  return (
    <Link to={`/stables/${stable.stableId}`} className="stable-card">
      <div className="stable-card__image-wrapper">
        <img
          src={resolveImageSrc(stable.imageUrl, DEFAULT_WRESTLER_IMAGE)}
          onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
          alt={stable.name}
          className="stable-card__image"
        />
      </div>
      <div className="stable-card__body">
        <h3 className="stable-card__name">{stable.name}</h3>
        <span className="stable-card__members">
          {t('stables.memberCount', '{{count}} members', { count: stable.memberIds.length })}
        </span>
        <div className="stable-card__stats">
          <span className="stable-card__stat stable-card__stat--wins">
            {stable.wins}{t('stables.wAbbrev', 'W')}
          </span>
          <span className="stable-card__stat stable-card__stat--losses">
            {stable.losses}{t('stables.lAbbrev', 'L')}
          </span>
          <span className="stable-card__stat stable-card__stat--draws">
            {stable.draws}{t('stables.dAbbrev', 'D')}
          </span>
          <span className="stable-card__stat stable-card__stat--winpct">
            {winPercentage}%
          </span>
        </div>
      </div>
    </Link>
  );
}
