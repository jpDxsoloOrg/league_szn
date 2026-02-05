import { useTranslation } from 'react-i18next';
import type { WrestlerWithCost } from '../../types/fantasy';
import './WrestlerCard.css';

interface WrestlerCardProps {
  wrestler: WrestlerWithCost;
  isSelected: boolean;
  isDisabled: boolean;
  canAfford: boolean;
  onToggle: () => void;
}

export default function WrestlerCard({
  wrestler,
  isSelected,
  isDisabled,
  canAfford,
  onToggle,
}: WrestlerCardProps) {
  const { t } = useTranslation();

  const getTrendIcon = () => {
    switch (wrestler.costTrend) {
      case 'up':
        return <span className="trend-icon up">▲</span>;
      case 'down':
        return <span className="trend-icon down">▼</span>;
      default:
        return <span className="trend-icon stable">—</span>;
    }
  };

  return (
    <div
      className={`wrestler-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
      onClick={!isDisabled ? onToggle : undefined}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-pressed={isSelected}
      aria-disabled={isDisabled}
    >
      <div className="card-checkbox">
        <span className={`checkbox ${isSelected ? 'checked' : ''}`}>
          {isSelected && '✓'}
        </span>
      </div>

      <div className="card-image">
        {wrestler.imageUrl ? (
          <img src={wrestler.imageUrl} alt={wrestler.currentWrestler} />
        ) : (
          <div className="placeholder-image">
            {wrestler.currentWrestler.charAt(0)}
          </div>
        )}
      </div>

      <div className="card-info">
        <h4 className="wrestler-name">{wrestler.currentWrestler}</h4>
        <p className="player-name">{wrestler.name}</p>
        <div className="wrestler-stats">
          <span className="record">{wrestler.recentRecord}</span>
          <span className="win-rate">{wrestler.winRate30Days}% {t('fantasy.picks.winRate')}</span>
        </div>
      </div>

      <div className="card-cost">
        <span className="cost-value">${wrestler.currentCost}</span>
        <span className="cost-trend">
          {getTrendIcon()}
          {wrestler.costTrend !== 'stable' && (
            <span className="trend-diff">
              {wrestler.costTrend === 'up' ? '+' : ''}
              {wrestler.currentCost - wrestler.baseCost}
            </span>
          )}
        </span>
      </div>

      {!canAfford && !isSelected && (
        <div className="over-budget-overlay">
          <span>{t('fantasy.picks.overBudget')}</span>
        </div>
      )}
    </div>
  );
}
