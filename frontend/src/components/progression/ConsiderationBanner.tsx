import { useTranslation } from 'react-i18next';
import { useIsConsidered } from '../../hooks/useConsiderations';
import type { ProgressionKind } from '../../types/progression';
import './ConsiderationBanner.css';

export interface ConsiderationBannerProps {
  playerId: string;
  kind?: ProgressionKind;
}

/**
 * Full-width profile banner shown while a GM has the player under
 * consideration. Renders nothing otherwise: no "not considered" message.
 */
export default function ConsiderationBanner({ playerId, kind = 'callup' }: ConsiderationBannerProps) {
  const { t } = useTranslation();
  const considered = useIsConsidered(playerId, kind);
  if (!considered) return null;

  return (
    <div className={`consideration-banner consideration-banner--${kind}`} role="status" data-testid="consideration-banner">
      <span className="consideration-banner__icon" aria-hidden="true">⭐</span>
      <span className="consideration-banner__text">{t(`progression.consideration.banner.${kind}`)}</span>
    </div>
  );
}
