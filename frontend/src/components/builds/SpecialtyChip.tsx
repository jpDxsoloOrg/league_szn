import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';
import Badge from '../ui/Badge';
import type { SimCategory } from '../../constants/simCategories';

export interface SpecialtyChipProps {
  category: SimCategory;
  className?: string;
}

/**
 * The match specialty as a pill ("Specialist: Hardcore"), with the example
 * stipulations as its tooltip. Shared by the build card and editor.
 */
export default function SpecialtyChip({ category, className }: SpecialtyChipProps) {
  const { t } = useTranslation();
  return (
    <Badge
      tone="primary"
      className={className}
      icon={<Target size={14} aria-hidden="true" />}
      title={t(`simCategories.examples.${category}`)}
      data-testid="specialty-chip"
    >
      {t('builds.specialist', { category: t(`simCategories.${category}`) })}
    </Badge>
  );
}
