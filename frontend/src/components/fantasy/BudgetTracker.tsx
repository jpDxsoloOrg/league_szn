import { useTranslation } from 'react-i18next';
import './BudgetTracker.css';

interface BudgetTrackerProps {
  budget: number;
  spent: number;
}

export default function BudgetTracker({ budget, spent }: BudgetTrackerProps) {
  const { t } = useTranslation();
  const remaining = budget - spent;
  const percentage = (spent / budget) * 100;

  const getStatusClass = () => {
    if (percentage >= 90) return 'critical';
    if (percentage >= 70) return 'warning';
    return 'healthy';
  };

  return (
    <div className="budget-tracker">
      <div className="budget-header">
        <h3>{t('fantasy.picks.budget')}</h3>
        <div className="budget-amounts">
          <span className="spent">${spent}</span>
          <span className="separator">/</span>
          <span className="total">${budget}</span>
        </div>
      </div>

      <div className="budget-bar-container">
        <div
          className={`budget-bar ${getStatusClass()}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      <div className="budget-footer">
        <span className={`remaining ${remaining < 50 ? 'low' : ''}`}>
          {t('fantasy.picks.remaining')}: <strong>${remaining}</strong>
        </span>
        <span className="percentage">{percentage.toFixed(0)}% {t('fantasy.picks.used')}</span>
      </div>
    </div>
  );
}
