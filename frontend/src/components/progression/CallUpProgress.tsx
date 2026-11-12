import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import GoalChecklist from './GoalChecklist';
import ProgressionMeter from './ProgressionMeter';
import { usePlayerProgression } from './usePlayerProgression';
import './CallUpProgress.css';

export interface CallUpProgressProps {
  playerId: string;
  /**
   * Show the goal checklist when the API returns goals (owner and Moderator+).
   * The public profile passes false for everyone but GMs.
   */
  showGoals?: boolean;
}

/**
 * Profile section with the player's call-up progress bar and, for the owner
 * and GMs, the goal checklist. Renders nothing for players on no call-up track.
 */
export default function CallUpProgress({ playerId, showGoals = true }: CallUpProgressProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const { tracks, loaded } = usePlayerProgression(playerId, 'callup');

  if (!loaded || tracks.length === 0) return null;

  return (
    <section className="profile-section callup-progress" aria-labelledby={headingId} data-testid="callup-progress">
      <h2 className="profile-section__title" id={headingId}>{t('progression.profile.title')}</h2>
      {tracks.map((track) => {
        const goals = showGoals ? track.goals ?? [] : [];
        return (
          <Card key={track.trackId} className="callup-progress__card">
            <ProgressionMeter pct={track.progressPct} kind={track.kind} caption={track.trackName} />
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
      })}
    </section>
  );
}
