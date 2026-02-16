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
        <span className="filter-label">{t(labelKey)}:</span>
      )}
      <div className="filter-buttons">
        <button
          type="button"
          className={`filter-btn ${selectedDivision === 'all' ? 'active' : ''}`}
          onClick={() => onSelect('all')}
        >
          {t('common.all')}
        </button>
        {divisions.map((division) => (
          <button
            type="button"
            key={division.divisionId}
            className={`filter-btn ${selectedDivision === division.divisionId ? 'active' : ''}`}
            onClick={() => onSelect(division.divisionId)}
          >
            {division.name}
          </button>
        ))}
        {showNoDivision && (
          <button
            type="button"
            className={`filter-btn ${selectedDivision === 'none' ? 'active' : ''}`}
            onClick={() => onSelect('none')}
          >
            {t('standings.noDivision')}
          </button>
        )}
      </div>
    </div>
  );
}
