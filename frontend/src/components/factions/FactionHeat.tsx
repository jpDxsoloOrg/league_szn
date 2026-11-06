import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './FactionHeat.css';

const FLAME_COUNT = 5;

interface FactionHeatProps {
  /** Streak length. Every streak type counts, so all pages read heat the same way. */
  count?: number;
  className?: string;
}

/** Five-flame gauge with one label for screen readers. Nothing shows until there is a streak. */
export default function FactionHeat({ count, className = '' }: FactionHeatProps) {
  const { t } = useTranslation();
  const lit = !count || count < 0 ? 0 : Math.min(FLAME_COUNT, Math.floor(count));
  if (lit === 0) return null;

  return (
    <span
      className={`faction-heat ${className}`.trim()}
      role="img"
      aria-label={t('factions.hub.heatLabel', 'Heat: {{lit}} of {{total}}', { lit, total: FLAME_COUNT })}
    >
      {Array.from({ length: FLAME_COUNT }, (_, index) => (
        <Flame
          key={index}
          aria-hidden="true"
          size={16}
          className={index < lit ? 'faction-heat__flame--lit' : 'faction-heat__flame--dim'}
        />
      ))}
    </span>
  );
}
