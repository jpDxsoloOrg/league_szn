import { useTranslation } from 'react-i18next';
import { useIsConsidered } from '../../hooks/useConsiderations';
import type { ProgressionKind } from '../../types/progression';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import './ConsiderationBanner.css';

const TONES: Record<ProgressionKind, BadgeTone> = {
  callup: 'win',
  promotion: 'warning',
  relegation: 'loss',
};

export interface ConsiderationBadgeProps {
  playerId: string;
  kind?: ProgressionKind;
}

/** Small "Call-up watch" pill for lists and cards. Renders nothing for unflagged players. */
export default function ConsiderationBadge({ playerId, kind = 'callup' }: ConsiderationBadgeProps) {
  const { t } = useTranslation();
  const considered = useIsConsidered(playerId, kind);
  if (!considered) return null;

  return (
    <Badge tone={TONES[kind]} className="consideration-badge" data-testid="consideration-badge">
      {t(`progression.consideration.badge.${kind}`)}
    </Badge>
  );
}
