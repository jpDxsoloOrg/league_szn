import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollFade } from '../hooks/useScrollFade';
import type { Division } from '../types';
import './DivisionFilter.css';

export interface DivisionFilterProps {
  divisions: Division[];
  selectedDivision: string;
  onSelect: (id: string) => void;
  /** i18n key naming the filter for screen readers. */
  labelKey?: string;
  /** Whether to show the "No division" option. Default true. */
  showNoDivision?: boolean;
}

/** Division pills. Wraps on desktop and scrolls within its own row on phones. */
export default function DivisionFilter({
  divisions,
  selectedDivision,
  onSelect,
  labelKey = 'standings.filterByDivision',
  showNoDivision = true,
}: DivisionFilterProps) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  useScrollFade(rowRef);

  const options = [
    { value: 'all', label: t('common.all') },
    ...divisions.map((division) => ({ value: division.divisionId, label: division.name })),
    ...(showNoDivision ? [{ value: 'none', label: t('standings.noDivision') }] : []),
  ];

  return (
    <div ref={rowRef} className="division-pills" role="group" aria-label={t(labelKey)}>
      {options.map((option) => {
        const selected = selectedDivision === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`division-pills__pill${selected ? ' division-pills__pill--selected' : ''}`}
            aria-pressed={selected}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
