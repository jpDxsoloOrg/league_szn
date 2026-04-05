import { useTranslation } from 'react-i18next';
import type { Division } from '../types';
import './DivisionFilter.css';

export interface DivisionFilterProps {
  divisions: Division[];
  selectedDivision: string;
  onSelect: (id: string) => void;
  /** i18n key for the label (e.g. standings.filterByDivision, championships.filterByDivision). Omit for no label. */
  labelKey?: string;
  /** Whether to show the "No division" option. Default true. */
  showNoDivision?: boolean;
}

export default function DivisionFilter({
  divisions,
  selectedDivision,
  onSelect,
  labelKey,
  showNoDivision = true,
}: DivisionFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="division-filter">
      {labelKey != null && (
        <label className="filter-label" htmlFor="division-filter-select">
          {t(labelKey)}:
        </label>
      )}
      <select
        id="division-filter-select"
        className="filter-select"
        value={selectedDivision}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="all">{t('common.all')}</option>
        {divisions.map((division) => (
          <option key={division.divisionId} value={division.divisionId}>
            {division.name}
          </option>
        ))}
        {showNoDivision && (
          <option value="none">{t('standings.noDivision')}</option>
        )}
      </select>
    </div>
  );
}
