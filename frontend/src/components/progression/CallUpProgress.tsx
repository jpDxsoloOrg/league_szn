import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import ProgressionTrackCard from './ProgressionTrackCard';
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
      {tracks.map((track) => (
        <ProgressionTrackCard key={track.trackId} track={track} showGoals={showGoals} />
      ))}
    </section>
  );
}
