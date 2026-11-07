import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import type { PlayerDisciplineSummary } from '../../types';
import { formatInstant } from '../../utils/dateUtils';
import { liveDiscipline } from '../../utils/discipline';
import { DISCIPLINE_STATUS_KEYS, DISCIPLINE_STATUS_TONES } from '../discipline/disciplineStatus';
import Badge from '../ui/Badge';

interface DisciplineBadgeProps {
  discipline?: PlayerDisciplineSummary | null;
}

/** A player's discipline state in a staff list. Renders nothing for a clear player. */
export default function DisciplineBadge({ discipline }: DisciplineBadgeProps) {
  const { t, i18n } = useTranslation();
  const live = liveDiscipline(discipline);
  if (!live || live.status === 'clear') return null;

  const endsAt = live.signupBlockedUntil ?? live.cooldownEndsAt;

  return (
    <Badge
      tone={DISCIPLINE_STATUS_TONES[live.status]}
      icon={<ShieldAlert aria-hidden="true" size={14} />}
      title={endsAt ? t('discipline.admin.until', { date: formatInstant(endsAt, i18n.language) }) : undefined}
    >
      {t(DISCIPLINE_STATUS_KEYS[live.status])}
    </Badge>
  );
}
