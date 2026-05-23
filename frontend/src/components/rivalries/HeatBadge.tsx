import { useTranslation } from 'react-i18next';
import type { RivalryHeat } from '../../types/rivalry';
import './HeatBadge.css';

/**
 * Reusable badge for displaying a rivalry's heat tier (RIV-31).
 *
 * Five tiers — frozen / cold / warm / hot / scorching — each get a
 * distinct colour variant. When `heatScore` is supplied the badge
 * exposes the raw score via the `title` tooltip (e.g. "Heat score: 47").
 */
export interface HeatBadgeProps {
  heat: RivalryHeat;
  heatScore?: number;
  size?: 'sm' | 'md' | 'lg';
  /** Whether to render the text label next to the icon. Defaults to true. */
  showLabel?: boolean;
}

const HEAT_ICONS: Record<RivalryHeat, string> = {
  frozen: '❄',
  cold: '🧊',
  warm: '✦',
  hot: '🔥',
  scorching: '🌋',
};

const defaultHeatLabel = (heat: RivalryHeat): string => {
  switch (heat) {
    case 'frozen':
      return 'Frozen';
    case 'cold':
      return 'Cold';
    case 'warm':
      return 'Warm';
    case 'hot':
      return 'Hot';
    case 'scorching':
      return 'Scorching';
  }
};

export const HeatBadge = ({
  heat,
  heatScore,
  size = 'md',
  showLabel = true,
}: HeatBadgeProps) => {
  const { t } = useTranslation();
  const label = t(`rivalry.heat.${heat}`, { defaultValue: defaultHeatLabel(heat) });
  const title =
    heatScore != null
      ? t('rivalry.heat.score', {
          defaultValue: 'Heat score: {{score}}',
          score: heatScore,
        })
      : undefined;
  return (
    <span
      className={`heat-badge heat-badge--${heat} heat-badge--${size}`}
      title={title}
      data-testid="heat-badge"
    >
      <span className="heat-badge__icon" aria-hidden>
        {HEAT_ICONS[heat]}
      </span>
      {showLabel && <span className="heat-badge__label">{label}</span>}
    </span>
  );
};

export default HeatBadge;
