import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import type { PlayerProgressionSummary } from '../../types/progression';
import GoalChecklist from './GoalChecklist';
import ProgressionMeter from './ProgressionMeter';
import './CallUpProgress.css';

export interface ProgressionTrackCardProps {
  track: PlayerProgressionSummary;
  /** Show the goal checklist when the API returned goals. */
  showGoals?: boolean;
  /** Extra content under the meter, e.g. the GM flag. */
  children?: ReactNode;
}

/** One track on a profile: the kind-coloured meter and, optionally, its goal checklist. */
export default function ProgressionTrackCard({ track, showGoals = true, children }: ProgressionTrackCardProps) {
  const { t } = useTranslation();
  const goals = showGoals ? track.goals ?? [] : [];

  return (
    <Card className="callup-progress__card" data-testid={`progression-track-${track.kind}`}>
      <ProgressionMeter pct={track.progressPct} kind={track.kind} caption={track.trackName} />
      {children}
      {goals.length > 0 && (
        <div className="callup-progress__goals">
          <h3 className="callup-progress__goals-title">
            {t('progression.goals.summary', {
              met: goals.filter((goal) => goal.met).length,
              total: goals.length,
            })}
          </h3>
          <GoalChecklist goals={goals} kind={track.kind} />
        </div>
      )}
    </Card>
  );
}
