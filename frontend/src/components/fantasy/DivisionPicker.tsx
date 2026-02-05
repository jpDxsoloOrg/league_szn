import { useTranslation } from 'react-i18next';
import type { WrestlerWithCost } from '../../types/fantasy';
import type { Division } from '../../types';
import WrestlerCard from './WrestlerCard';
import './DivisionPicker.css';

interface DivisionPickerProps {
  division: Division;
  wrestlers: WrestlerWithCost[];
  selectedIds: string[];
  maxPicks: number;
  remainingBudget: number;
  onToggle: (playerId: string) => void;
}

export default function DivisionPicker({
  division,
  wrestlers,
  selectedIds,
  maxPicks,
  remainingBudget,
  onToggle,
}: DivisionPickerProps) {
  const { t } = useTranslation();
  const isMaxed = selectedIds.length >= maxPicks;

  return (
    <div className="division-picker">
      <div className="division-header">
        <h3>{division.name}</h3>
        <span className="selection-status">
          {t('fantasy.picks.selected')}: {selectedIds.length}/{maxPicks}
          {isMaxed && <span className="maxed-badge">{t('fantasy.picks.maxed')}</span>}
        </span>
      </div>

      <div className="wrestlers-grid">
        {wrestlers.map((wrestler) => {
          const isSelected = selectedIds.includes(wrestler.playerId);
          const canAfford = wrestler.currentCost <= remainingBudget || isSelected;
          const isDisabled = !isSelected && (isMaxed || !canAfford);

          return (
            <WrestlerCard
              key={wrestler.playerId}
              wrestler={wrestler}
              isSelected={isSelected}
              isDisabled={isDisabled}
              canAfford={canAfford}
              onToggle={() => onToggle(wrestler.playerId)}
            />
          );
        })}
      </div>

      {wrestlers.length === 0 && (
        <p className="no-wrestlers">{t('fantasy.picks.noWrestlersInDivision')}</p>
      )}
    </div>
  );
}
