import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import type { PlayerProgressionSummary, ProgressionKind } from '../../types/progression';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import ProgressionTrackCard from './ProgressionTrackCard';
import { staySharpTips, visibleMeterTracks } from './divisionProgressVisibility';
import type { ProfileViewer } from './divisionProgressVisibility';
import { usePlayerProgression } from './usePlayerProgression';
import './CallUpProgress.css';
import './DivisionProgress.css';

const DIVISION_KINDS: readonly ProgressionKind[] = ['promotion', 'relegation'];

export interface DivisionProgressProps {
  playerId: string;
  viewer: ProfileViewer;
}

function StaffFlag({ track }: { track: PlayerProgressionSummary }) {
  const { t } = useTranslation();
  if (!track.consideration) return null;
  const note = track.considerationDetail?.note;
  return (
    <div className="division-progress__flag" data-testid={`division-flag-${track.kind}`}>
      <Badge tone={track.kind === 'relegation' ? 'loss' : 'warning'}>
        {t(`progression.consideration.badge.${track.kind}`)}
      </Badge>
      {note && <span className="division-progress__note">{t('progression.division.gmNote', { note })}</span>}
    </div>
  );
}

/**
 * Promotion and relegation meters on a profile, filtered by who is looking:
 * - public: the gold promotion meter; the relegation meter only when the
 *   league turned on `publicRelegationWatch`;
 * - owner: the promotion meter and checklist, plus gentle "Stay sharp" tips
 *   instead of any relegation meter (house rule: never demoralise);
 * - staff: both meters, every goal and the GM flags.
 * Renders nothing when there is nothing to show.
 */
export default function DivisionProgress({ playerId, viewer }: DivisionProgressProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const { tickerSettings } = useSiteConfig();
  const { tracks, loaded } = usePlayerProgression(playerId, DIVISION_KINDS);

  if (!loaded) return null;

  const meters = visibleMeterTracks(tracks, viewer, tickerSettings.publicRelegationWatch);
  const tips = viewer === 'owner' ? staySharpTips(tracks) : [];
  if (meters.length === 0 && tips.length === 0) return null;

  // Promotion first, so a wrestler on both tracks leads with the good news.
  const ordered = [...meters].sort((a, b) => Number(a.kind === 'relegation') - Number(b.kind === 'relegation'));
  const showGoals = viewer !== 'public';

  return (
    <section className="profile-section division-progress" aria-labelledby={headingId} data-testid="division-progress">
      <h2 className="profile-section__title" id={headingId}>{t('progression.division.title')}</h2>
      {ordered.map((track) => (
        <ProgressionTrackCard key={track.trackId} track={track} showGoals={showGoals}>
          {viewer === 'staff' && <StaffFlag track={track} />}
        </ProgressionTrackCard>
      ))}
      {tips.length > 0 && (
        <Card className="callup-progress__card stay-sharp" data-testid="stay-sharp">
          <h3 className="stay-sharp__title">
            <Sparkles aria-hidden="true" size={18} />
            {t('progression.staySharp.title')}
          </h3>
          <p className="stay-sharp__intro">{t('progression.staySharp.intro')}</p>
          <ul className="stay-sharp__list">
            {tips.map((tip) => (
              <li key={tip} className="stay-sharp__item">{t(`progression.staySharp.tips.${tip}`)}</li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
