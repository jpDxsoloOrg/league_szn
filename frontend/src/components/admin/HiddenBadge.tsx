import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Badge from '../ui/Badge';

/** Marks a player with no wrestler, who is hidden from public roster views. */
export default function HiddenBadge() {
  const { t } = useTranslation();

  return (
    <Badge
      tone="warning"
      icon={<EyeOff aria-hidden="true" size={14} />}
      title={t('adminRoster.hidden.hint', 'No wrestler assigned, so this player is hidden from public pages')}
    >
      {t('adminRoster.hidden.badge', 'Hidden')}
    </Badge>
  );
}
