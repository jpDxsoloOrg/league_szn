import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import StaminaMeter from './StaminaMeter';
import { usePlayerCondition } from './usePlayerCondition';

export interface StaminaSectionProps {
  playerId: string;
  /** True for the player themselves and for staff; nobody else may see stamina. */
  canView: boolean;
}

/** Profile section with the stamina meter (INJ-12). Renders nothing for other viewers or while the feature is off. */
export default function StaminaSection({ playerId, canView }: StaminaSectionProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const condition = usePlayerCondition(playerId, canView);
  if (!condition) return null;

  return (
    <section className="profile-section" aria-labelledby={headingId}>
      <h2 className="profile-section__title" id={headingId}>{t('injuries.stamina.title')}</h2>
      <Card>
        <StaminaMeter condition={condition} />
      </Card>
    </section>
  );
}
