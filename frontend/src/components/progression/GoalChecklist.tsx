import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleDashed } from 'lucide-react';
import type { ProgressionGoalDetail, ProgressionKind } from '../../types/progression';
import { goalFill, goalLabel, goalProgressText } from './progressionFormat';
import './GoalChecklist.css';

export interface GoalChecklistProps {
  goals: ProgressionGoalDetail[];
  kind?: ProgressionKind;
  className?: string;
}

/** One row per goal: met/unmet icon, label, current / threshold and a mini bar. */
export default function GoalChecklist({ goals, kind = 'callup', className = '' }: GoalChecklistProps) {
  const { t } = useTranslation();

  if (goals.length === 0) return null;

  return (
    <ul className={`goal-checklist goal-checklist--${kind} ${className}`.trim()} aria-label={t('progression.goals.title')}>
      {goals.map((goal) => {
        const label = goalLabel(t, goal);
        const progressText = goalProgressText(t, goal);
        return (
          <li
            key={goal.goalId}
            className={`goal-checklist__item${goal.met ? ' goal-checklist__item--met' : ''}`}
            data-testid={`goal-${goal.goalId}`}
          >
            <span className="goal-checklist__icon">
              {goal.met
                ? <CircleCheck aria-hidden="true" size={20} />
                : <CircleDashed aria-hidden="true" size={20} />}
            </span>
            <span className="goal-checklist__label">
              {label}
              <span className="sr-only">
                {' '}{goal.met ? t('progression.goals.met') : t('progression.goals.notMet')}
              </span>
            </span>
            <span className="goal-checklist__value">{progressText}</span>
            <progress
              className="goal-checklist__bar"
              value={Math.round(goalFill(goal) * 100)}
              max={100}
              aria-hidden="true"
            />
          </li>
        );
      })}
    </ul>
  );
}
