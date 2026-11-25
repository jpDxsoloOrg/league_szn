import { useTranslation } from 'react-i18next';
import { Shapes } from 'lucide-react';
import Badge from '../ui/Badge';
import type { BuildStyleId } from '../../services/api/builds.api';

export interface StyleBadgeProps {
  style: BuildStyleId;
  className?: string;
}

/** The wrestler's style as a pill ("Powerhouse"). Shared by the build card and editor. */
export default function StyleBadge({ style, className }: StyleBadgeProps) {
  const { t } = useTranslation();
  return (
    <Badge
      tone="violet"
      className={className}
      icon={<Shapes size={14} aria-hidden="true" />}
      data-testid="style-badge"
    >
      {t(`builds.styles.${style}`)}
    </Badge>
  );
}
