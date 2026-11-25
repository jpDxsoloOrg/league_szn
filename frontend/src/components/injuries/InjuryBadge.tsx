import { useTranslation } from 'react-i18next';
import { Bandage } from 'lucide-react';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import type { PublicCurrentInjury } from '../../types/injury';
import Badge from '../ui/Badge';
import { activeInjury, formatInjuryDate } from './injuryDisplay';
import './InjuryBadge.css';

export interface InjuryBadgeProps {
  injury?: PublicCurrentInjury | null;
  className?: string;
}

/**
 * Public injury badge (INJ-12): "Injured, returns Sun, 30 Nov". Renders
 * nothing for a player who is not injured, once the return date has passed,
 * or while the injuries feature is off.
 */
export default function InjuryBadge({ injury, className = '' }: InjuryBadgeProps) {
  const active = activeInjury(injury);
  // Rows without an injury render nothing and read no context, so lists stay cheap.
  return active ? <ActiveInjuryBadge injury={active} className={className} /> : null;
}

function ActiveInjuryBadge({ injury, className }: { injury: PublicCurrentInjury; className: string }) {
  const { t, i18n } = useTranslation();
  const { features } = useSiteConfig();
  if (!features.injuries) return null;

  return (
    <Badge
      tone="warning"
      className={`injury-badge ${className}`.trim()}
      icon={<Bandage size={12} aria-hidden="true" />}
      data-testid="injury-badge"
    >
      {t('injuries.badge.returns', { date: formatInjuryDate(injury.returnsAt, i18n.language) })}
    </Badge>
  );
}
