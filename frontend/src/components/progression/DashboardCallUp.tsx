import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import HomeSection from '../home/HomeSection';
import Card from '../ui/Card';
import ProgressionMeter from './ProgressionMeter';
import { usePlayerProgression } from './usePlayerProgression';
import './CallUpProgress.css';

/**
 * "Road to the Main Roster" dashboard card for a logged-in wrestler on a
 * call-up track. Self-gates: renders nothing for anyone else.
 */
export default function DashboardCallUp() {
  const { t } = useTranslation();
  const { isAuthenticated, isWrestler, playerId } = useAuth();
  const eligible = isAuthenticated && isWrestler && Boolean(playerId);
  const { tracks, loaded } = usePlayerProgression(eligible ? playerId : null, 'callup');

  if (!eligible || !loaded || tracks.length === 0) return null;

  return (
    <HomeSection
      title={t('progression.dashboard.title')}
      accent="cyan"
      linkTo="/profile"
      linkLabel={t('progression.dashboard.link')}
    >
      <Card className="callup-dashboard__card">
        {tracks.map((track) => {
          const goals = track.goals ?? [];
          return (
            <ProgressionMeter
              key={track.trackId}
              pct={track.progressPct}
              kind={track.kind}
              size="sm"
              caption={goals.length > 0
                ? t('progression.goals.summary', { met: goals.filter((goal) => goal.met).length, total: goals.length })
                : track.trackName}
            />
          );
        })}
      </Card>
    </HomeSection>
  );
}
